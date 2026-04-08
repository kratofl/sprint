//go:build windows

// usb.go implements the VoCore screen USB transport for Windows using the
// native WinUSB API. No CGO, no libusb installation required.
//
// Prerequisites:
//   - The VoCore device must have the WinUSB driver bound to it. SimHub's
//     VOCOREScreenSetup does this automatically. If not installed, use
//     Zadig (https://zadig.akeo.ie) to bind the VoCore to WinUSB.
package hardware

import (
	"fmt"
	"log/slog"
	"strings"
	"syscall"
	"unsafe"
)

var (
	modSetupAPI = syscall.NewLazyDLL("setupapi.dll")
	modWinUSB   = syscall.NewLazyDLL("winusb.dll")

	procSetupDiGetClassDevsW             = modSetupAPI.NewProc("SetupDiGetClassDevsW")
	procSetupDiEnumDeviceInterfaces      = modSetupAPI.NewProc("SetupDiEnumDeviceInterfaces")
	procSetupDiGetDeviceInterfaceDetailW = modSetupAPI.NewProc("SetupDiGetDeviceInterfaceDetailW")
	procSetupDiDestroyDeviceInfoList     = modSetupAPI.NewProc("SetupDiDestroyDeviceInfoList")

	procWinUsbInitialize      = modWinUSB.NewProc("WinUsb_Initialize")
	procWinUsbFree            = modWinUSB.NewProc("WinUsb_Free")
	procWinUsbControlTransfer = modWinUSB.NewProc("WinUsb_ControlTransfer")
	procWinUsbWritePipe       = modWinUSB.NewProc("WinUsb_WritePipe")
	procWinUsbResetPipe       = modWinUSB.NewProc("WinUsb_ResetPipe")
	procWinUsbSetPowerPolicy  = modWinUSB.NewProc("WinUsb_SetPowerPolicy")
)

// GUID_DEVINTERFACE_USB_DEVICE {A5DCBF10-6530-11D2-901F-00C04FB951ED}
var guidUSBDevice = winGUID{
	Data1: 0xA5DCBF10,
	Data2: 0x6530,
	Data3: 0x11D2,
	Data4: [8]byte{0x90, 0x1F, 0x00, 0xC0, 0x4F, 0xB9, 0x51, 0xED},
}

type winGUID struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}

// spDeviceInterfaceData mirrors SP_DEVICE_INTERFACE_DATA (x64: 32 bytes).
type spDeviceInterfaceData struct {
	CbSize             uint32
	InterfaceClassGUID winGUID
	Flags              uint32
	Reserved           uintptr
}

const (
	digcfPresent         = 0x02
	digcfDeviceInterface = 0x10
	// SP_DEVICE_INTERFACE_DETAIL_DATA_W.CbSize on x64.
	detailDataCbSize = 8
	// fileShareDelete allows other processes to delete (uninstall) the device
	// interface while this handle is open. Required on some Windows 10/11
	// configurations to open pre-connected WinUSB devices without ACCESS_DENIED.
	fileShareDelete = 0x00000004
)

// VoCore M-PRO screen USB protocol constants (from mpro_drm driver).
const (
	usbBulkEndpoint = 0x02 // bulk OUT endpoint for pixel data
	usbVendorReq    = 0xB0 // vendor-specific control request
	usbReqTypeOut   = 0x40 // USB_DIR_OUT | USB_TYPE_VENDOR | USB_RECIP_DEVICE
)

// openVoCoreScreen opens a USB connection to the VoCore screen by VID/PID.
func openVoCoreScreen(vid, pid uint16, width, height int, logger *slog.Logger) (screenTransport, error) {
	if err := modWinUSB.Load(); err != nil {
		return nil, fmt.Errorf("WinUSB not available: %w", err)
	}

	path, err := findUSBDevicePath(vid, pid)
	if err != nil {
		return nil, err
	}

	pathUTF16, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return nil, fmt.Errorf("invalid device path: %w", err)
	}

	devHandle, err := syscall.CreateFile(
		pathUTF16,
		syscall.GENERIC_READ|syscall.GENERIC_WRITE,
		syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|fileShareDelete,
		nil,
		syscall.OPEN_EXISTING,
		syscall.FILE_ATTRIBUTE_NORMAL|syscall.FILE_FLAG_OVERLAPPED,
		0,
	)
	if err != nil {
		if errno, ok := err.(syscall.Errno); ok && errno == 5 {
			return nil, fmt.Errorf("open device: access denied (another application may have exclusive access to the screen — close SimHub or other USB tools)")
		}
		return nil, fmt.Errorf("open device: %w", err)
	}

	var winusbHandle uintptr
	r, _, callErr := procWinUsbInitialize.Call(
		uintptr(devHandle),
		uintptr(unsafe.Pointer(&winusbHandle)),
	)
	if r == 0 {
		syscall.CloseHandle(devHandle)
		if isDriverNotBoundError(callErr) {
			return nil, fmt.Errorf("%w: VID=%04X PID=%04X — run SimHub's VOCOREScreenSetup or use Zadig (https://zadig.akeo.ie)", ErrDriverNotInstalled, vid, pid)
		}
		return nil, fmt.Errorf("WinUsb_Initialize: %w (ensure the WinUSB driver is bound to VID=%04X PID=%04X — run SimHub's VOCOREScreenSetup or use Zadig)", callErr, vid, pid)
	}

	s := &winusbSender{
		devHandle:    devHandle,
		winusbHandle: winusbHandle,
		nativeW:      width,
		nativeH:      height,
		logger:       logger,
	}

	// Clear any stale STALL/HALT condition on the bulk OUT endpoint.
	s.resetPipe(usbBulkEndpoint)

	// Query the screen model to determine actual native dimensions.
	func() {
		defer func() {
			if r := recover(); r != nil {
				logger.Warn("screen model query panicked, using configured dimensions", "panic", r)
			}
		}()
		model, err := s.queryScreenModel()
		if err != nil {
			logger.Warn("could not query screen model, using configured dimensions", "err", err)
			s.resetPipe(0x00)
			return
		}
		nw, nh := mproModelDimensions(model)
		logger.Info("VoCore screen model detected",
			"model_id", fmt.Sprintf("0x%08X", model),
			"native", fmt.Sprintf("%dx%d", nw, nh))
		s.nativeW = nw
		s.nativeH = nh
	}()

	screenSize, err := validateScreenSize(s.nativeW, s.nativeH)
	if err != nil {
		s.close()
		return nil, err
	}

	// Send display initialization: "quit sleep" (0x29) wakes the panel from any
	// power state — this is the only wake command used by the official mpro DRM
	// driver (cmd_quit_sleep). Do NOT send 0x11 (SLEEP_OUT) first; the VoCore
	// firmware handles the full wake sequence internally on receiving 0x29.
	// After waking, restore the backlight to full brightness via 0x51, since
	// SimHub's "disable" sets brightness=0 rather than entering hardware sleep.
	wake := [6]byte{0x00, 0x29, 0x00, 0x00, 0x00, 0x00}
	if err := s.controlOut(wake[:]); err != nil {
		logger.Warn("display wake failed (non-fatal)", "err", err)
	}

	brightness := [8]byte{0x00, 0x51, 0x02, 0x00, 0x00, 0x00, 0xFF, 0x00}
	if err := s.controlOut(brightness[:]); err != nil {
		logger.Warn("brightness restore failed (non-fatal)", "err", err)
	}

	// Build the 6-byte full-frame draw command (mode + Memory Write + size).
	s.cmd[0] = 0x00 // mode: RGB565
	s.cmd[1] = 0x2C // Memory Write
	s.cmd[2] = byte(screenSize)
	s.cmd[3] = byte(screenSize >> 8)
	s.cmd[4] = byte(screenSize >> 16)
	s.cmd[5] = 0x00

	logger.Info("VoCore screen opened (WinUSB)",
		"vid", fmt.Sprintf("0x%04X", vid),
		"pid", fmt.Sprintf("0x%04X", pid),
		"native", fmt.Sprintf("%dx%d", s.nativeW, s.nativeH),
		"frame_bytes", screenSize)

	return s, nil
}

// winusbSender sends frames to the VoCore screen via native Windows WinUSB API.
type winusbSender struct {
	devHandle    syscall.Handle
	winusbHandle uintptr
	cmd          [12]byte
	nativeW      int
	nativeH      int
	logger       *slog.Logger
}

// controlOut sends a vendor-specific USB control OUT transfer (request 0xB0).
func (s *winusbSender) controlOut(data []byte) error {
	var pkt [8]byte
	pkt[0] = usbReqTypeOut
	pkt[1] = usbVendorReq
	pkt[6] = byte(len(data))
	pkt[7] = byte(len(data) >> 8)

	var transferred uint32
	var bufPtr uintptr
	if len(data) > 0 {
		bufPtr = uintptr(unsafe.Pointer(&data[0]))
	}

	r, _, err := procWinUsbControlTransfer.Call(
		s.winusbHandle,
		*(*uintptr)(unsafe.Pointer(&pkt[0])),
		bufPtr,
		uintptr(len(data)),
		uintptr(unsafe.Pointer(&transferred)),
		0,
	)
	if r == 0 {
		return fmt.Errorf("WinUsb_ControlTransfer: %w", err)
	}
	return nil
}

func (s *winusbSender) send(rgb565 []byte) error {
	if err := s.controlOut(s.cmd[:6]); err != nil {
		return fmt.Errorf("control transfer: %w", err)
	}

	var transferred uint32
	r, _, err := procWinUsbWritePipe.Call(
		s.winusbHandle,
		uintptr(usbBulkEndpoint),
		uintptr(unsafe.Pointer(&rgb565[0])),
		uintptr(len(rgb565)),
		uintptr(unsafe.Pointer(&transferred)),
		0,
	)
	if r == 0 {
		return fmt.Errorf("bulk write: %w", err)
	}
	return nil
}

func (s *winusbSender) nativeSize() (int, int) {
	return s.nativeW, s.nativeH
}

// displaySleep sets the backlight brightness to 0, turning the panel dark
// without putting the controller into deep sleep. This matches SimHub's
// "disable" behaviour and leaves the device in a state where a single 0x29
// + brightness-restore can wake it reliably.
func (s *winusbSender) displaySleep() {
	brightness := [8]byte{0x00, 0x51, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00}
	if err := s.controlOut(brightness[:]); err != nil {
		s.logger.Warn("brightness off failed (non-fatal)", "err", err)
	}
}

func (s *winusbSender) close() {
	s.displaySleep()
	s.resetPipe(usbBulkEndpoint)
	procWinUsbFree.Call(s.winusbHandle)
	syscall.CloseHandle(s.devHandle)
	s.logger.Info("VoCore screen closed")
}

func (s *winusbSender) resetPipe(pipeID byte) {
	procWinUsbResetPipe.Call(s.winusbHandle, uintptr(pipeID))
}

// controlIn performs a vendor-specific USB control IN transfer (read from device).
func (s *winusbSender) controlIn(request byte, buf []byte) (int, error) {
	var pkt [8]byte
	pkt[0] = 0xC0 // USB_DIR_IN | USB_TYPE_VENDOR | USB_RECIP_DEVICE
	pkt[1] = request
	pkt[6] = byte(len(buf))
	pkt[7] = byte(len(buf) >> 8)

	var transferred uint32
	var bufPtr uintptr
	if len(buf) > 0 {
		bufPtr = uintptr(unsafe.Pointer(&buf[0]))
	}

	r, _, err := procWinUsbControlTransfer.Call(
		s.winusbHandle,
		*(*uintptr)(unsafe.Pointer(&pkt[0])),
		bufPtr,
		uintptr(len(buf)),
		uintptr(unsafe.Pointer(&transferred)),
		0,
	)
	if r == 0 {
		return 0, fmt.Errorf("WinUsb_ControlTransfer IN 0x%02X: %w", request, err)
	}
	return int(transferred), nil
}

// queryScreenModel queries the VoCore device for its screen model ID using
// the mpro protocol (control transfers 0xB5/0xB6/0xB7).
func (s *winusbSender) queryScreenModel() (uint32, error) {
	cmdGetScreen := [5]byte{0x51, 0x02, 0x04, 0x1F, 0xFC}
	if err := s.controlOutReq(0xB5, cmdGetScreen[:]); err != nil {
		return 0, fmt.Errorf("send get_screen cmd: %w", err)
	}

	var status [1]byte
	if _, err := s.controlIn(0xB6, status[:]); err != nil {
		return 0, fmt.Errorf("read status: %w", err)
	}

	var resp [5]byte
	n, err := s.controlIn(0xB7, resp[:])
	if err != nil {
		return 0, fmt.Errorf("read screen data: %w", err)
	}
	if n < 5 {
		return 0, fmt.Errorf("short response: got %d bytes, want 5", n)
	}

	model := uint32(resp[1]) | uint32(resp[2])<<8 | uint32(resp[3])<<16 | uint32(resp[4])<<24
	return model, nil
}

// controlOutReq sends a vendor-specific USB control OUT transfer with a custom request code.
func (s *winusbSender) controlOutReq(request byte, data []byte) error {
	var pkt [8]byte
	pkt[0] = usbReqTypeOut
	pkt[1] = request
	pkt[6] = byte(len(data))
	pkt[7] = byte(len(data) >> 8)

	var transferred uint32
	var bufPtr uintptr
	if len(data) > 0 {
		bufPtr = uintptr(unsafe.Pointer(&data[0]))
	}

	r, _, err := procWinUsbControlTransfer.Call(
		s.winusbHandle,
		*(*uintptr)(unsafe.Pointer(&pkt[0])),
		bufPtr,
		uintptr(len(data)),
		uintptr(unsafe.Pointer(&transferred)),
		0,
	)
	if r == 0 {
		return fmt.Errorf("WinUsb_ControlTransfer OUT 0x%02X: %w", request, err)
	}
	return nil
}

// findUSBDevicePath enumerates USB device interfaces and returns the device
// path for the VoCore matching the given VID/PID.
func findUSBDevicePath(vid, pid uint16) (string, error) {
	path, err := findUSBDevicePathWithGUID(vid, pid, &guidUSBDevice)
	if err != nil {
		return "", fmt.Errorf("VoCore screen (VID=%04X PID=%04X) not found — is the device connected?", vid, pid)
	}
	return path, nil
}

// findUSBDevicePathWithGUID enumerates device interfaces under the given interface
// GUID and returns the best matching path for the given VID/PID.
//
// "Best" means a whole-device path (no &mi_ component) is preferred over a
// per-interface composite path (&mi_XX). On Windows, OUT vendor control transfers
// fail when WinUSB is installed per-interface on a composite device because usbccgp
// does not route them to the interface driver. Whole-device paths work correctly.
// Per-interface paths are returned as a fallback if no whole-device path exists.
func findUSBDevicePathWithGUID(vid, pid uint16, guid *winGUID) (string, error) {
	target := fmt.Sprintf("vid_%04x&pid_%04x", vid, pid)

	r, _, err := procSetupDiGetClassDevsW.Call(
		uintptr(unsafe.Pointer(guid)),
		0, 0,
		uintptr(digcfPresent|digcfDeviceInterface),
	)
	if r == 0 || syscall.Handle(r) == syscall.InvalidHandle {
		return "", fmt.Errorf("SetupDiGetClassDevs: %w", err)
	}
	hDevInfo := r
	defer procSetupDiDestroyDeviceInfoList.Call(hDevInfo)

	var ifData spDeviceInterfaceData
	ifData.CbSize = uint32(unsafe.Sizeof(ifData))

	var interfaceFallback string // per-interface path (&mi_XX), used if no whole-device found

	for i := uint32(0); ; i++ {
		r, _, _ := procSetupDiEnumDeviceInterfaces.Call(
			hDevInfo,
			0,
			uintptr(unsafe.Pointer(guid)),
			uintptr(i),
			uintptr(unsafe.Pointer(&ifData)),
		)
		if r == 0 {
			break
		}

		var requiredSize uint32
		procSetupDiGetDeviceInterfaceDetailW.Call(
			hDevInfo,
			uintptr(unsafe.Pointer(&ifData)),
			0, 0,
			uintptr(unsafe.Pointer(&requiredSize)),
			0,
		)
		if requiredSize == 0 {
			continue
		}

		buf := make([]byte, requiredSize)
		*(*uint32)(unsafe.Pointer(&buf[0])) = detailDataCbSize

		r, _, _ = procSetupDiGetDeviceInterfaceDetailW.Call(
			hDevInfo,
			uintptr(unsafe.Pointer(&ifData)),
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(requiredSize),
			0, 0,
		)
		if r == 0 {
			continue
		}

		pathBytes := buf[4:]
		pathUTF16 := make([]uint16, len(pathBytes)/2)
		for j := range pathUTF16 {
			pathUTF16[j] = *(*uint16)(unsafe.Pointer(&pathBytes[j*2]))
			if pathUTF16[j] == 0 {
				pathUTF16 = pathUTF16[:j]
				break
			}
		}
		path := syscall.UTF16ToString(pathUTF16)
		lower := strings.ToLower(path)

		if !strings.Contains(lower, target) {
			continue
		}
		if !strings.Contains(lower, "&mi_") {
			return path, nil // whole-device path — prefer immediately
		}
		if interfaceFallback == "" {
			interfaceFallback = path // keep first per-interface path as fallback
		}
	}

	if interfaceFallback != "" {
		return interfaceFallback, nil
	}
	return "", fmt.Errorf("device (VID=%04X PID=%04X) not found", vid, pid)
}

// screen model ID. Values from the mpro_drm Linux driver.
func mproModelDimensions(model uint32) (width, height int) {
	switch model {
	case 0x00000005: // MPRO-5 (5")
		return 480, 854
	case 0x00001005: // MPRO-5H (5" OLED)
		return 720, 1280
	case 0x00000007: // MPRO-6IN8 (6.8" — native landscape)
		return 800, 480
	case 0x00000403: // MPRO-3IN4 (3.4" — square)
		return 800, 800
	case 0x0000000a: // MPRO-10 (10")
		return 1024, 600
	default:
		return 480, 800
	}
}

// isDriverNotBoundError returns true when err from WinUsb_Initialize indicates
// that winusb.sys is not the function driver for the device (as opposed to a
// transient I/O error or access-denied).
// Common codes from Windows when WinUSB driver is not bound:
//   - ERROR_GEN_FAILURE    (0x1F = 31)  — most common on Windows 10/11
//   - ERROR_BAD_DRIVER     (0xE7 = 231) — less common
//   - ERROR_INVALID_HANDLE (0x6  = 6)   — seen on some configurations
func isDriverNotBoundError(err error) bool {
	errno, ok := err.(syscall.Errno)
	if !ok {
		return false
	}
	switch errno {
	case 31,  // ERROR_GEN_FAILURE
		231, // ERROR_BAD_DRIVER
		6:   // ERROR_INVALID_HANDLE
		return true
	}
	return false
}
