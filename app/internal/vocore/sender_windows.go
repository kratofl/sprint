//go:build windows

// sender_windows.go implements the VoCore screen USB transport for Windows
// using the native WinUSB API. No CGO, no libusb installation required.
//
// Prerequisites:
//   - The VoCore device must have the WinUSB driver bound to it. SimHub's
//     VOCOREScreenSetup does this automatically. If not installed, use
//     Zadig (https://zadig.akeo.ie) to bind the VoCore to WinUSB.
//
// This implementation uses SetupDI to enumerate USB device interfaces,
// finds the VoCore by VID/PID, opens it with CreateFile, and communicates
// via WinUSB control and bulk transfers.
package vocore

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
)

// winusbSender sends frames to the VoCore screen via native Windows WinUSB API.
type winusbSender struct {
	devHandle    syscall.Handle
	winusbHandle uintptr
	cmd          [12]byte
	nativeW      int // native screen width (from device query)
	nativeH      int // native screen height
	logger       *slog.Logger
}

func openScreenImpl(vid, pid uint16, width, height int, logger *slog.Logger) (frameSender, error) {
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
		syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE,
		nil,
		syscall.OPEN_EXISTING,
		syscall.FILE_ATTRIBUTE_NORMAL|syscall.FILE_FLAG_OVERLAPPED,
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("open device: %w", err)
	}

	var winusbHandle uintptr
	r, _, callErr := procWinUsbInitialize.Call(
		uintptr(devHandle),
		uintptr(unsafe.Pointer(&winusbHandle)),
	)
	if r == 0 {
		syscall.CloseHandle(devHandle)
		return nil, fmt.Errorf("WinUsb_Initialize: %w (ensure the WinUSB driver is bound to VID=%04X PID=%04X — run SimHub's VOCOREScreenSetup or use Zadig)", callErr, vid, pid)
	}

	s := &winusbSender{
		devHandle:    devHandle,
		winusbHandle: winusbHandle,
		nativeW:      width,
		nativeH:      height,
		logger:       logger,
	}

	// Query the screen model to determine actual native dimensions.
	if model, err := s.queryScreenModel(); err != nil {
		logger.Warn("could not query screen model, using configured dimensions", "err", err)
	} else {
		nw, nh := mproModelDimensions(model)
		logger.Info("VoCore screen model detected",
			"model_id", fmt.Sprintf("0x%08X", model),
			"native", fmt.Sprintf("%dx%d", nw, nh))
		s.nativeW = nw
		s.nativeH = nh
	}

	screenSize, err := validateScreenSize(s.nativeW, s.nativeH)
	if err != nil {
		s.close()
		return nil, err
	}

	// Send display initialization: Sleep Out → Display ON.
	sleepOut := [6]byte{0x00, 0x11, 0x00, 0x00, 0x00, 0x00}
	if err := s.controlOut(sleepOut[:]); err != nil {
		logger.Warn("sleep-out failed (non-fatal)", "err", err)
	}

	wake := [6]byte{0x00, 0x29, 0x00, 0x00, 0x00, 0x00}
	if err := s.controlOut(wake[:]); err != nil {
		logger.Warn("display wake failed (non-fatal)", "err", err)
	}

	// Build the 6-byte full-frame draw command (mode + Memory Write + size).
	// The firmware uses its native resolution to interpret the pixel data,
	// so we don't specify x/y/width in the command.
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

// controlOut sends a vendor-specific USB control OUT transfer (request 0xB0).
func (s *winusbSender) controlOut(data []byte) error {
	// Pack the 8-byte WINUSB_SETUP_PACKET (passed by value on x64).
	var pkt [8]byte
	pkt[0] = usbReqTypeOut
	pkt[1] = usbVendorReq
	// pkt[2:3] = wValue (0)
	// pkt[4:5] = wIndex (0)
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
	// Send 6-byte draw command via USB control transfer.
	if err := s.controlOut(s.cmd[:6]); err != nil {
		return fmt.Errorf("control transfer: %w", err)
	}

	// Send pixel data via USB bulk OUT transfer.
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

func (s *winusbSender) close() {
	procWinUsbFree.Call(s.winusbHandle)
	syscall.CloseHandle(s.devHandle)
	s.logger.Info("VoCore screen closed")
}

// controlIn performs a vendor-specific USB control IN transfer (read from device).
func (s *winusbSender) controlIn(request byte, buf []byte) (int, error) {
	var pkt [8]byte
	pkt[0] = 0xC0 // USB_DIR_IN | USB_TYPE_VENDOR | USB_RECIP_DEVICE
	pkt[1] = request
	// pkt[2:3] = wValue (0)
	// pkt[4:5] = wIndex (0)
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
// the mpro protocol (control transfers 0xB5/0xB6/0xB7). Returns the 4-byte
// model identifier used by mproModelDimensions to look up native resolution.
func (s *winusbSender) queryScreenModel() (uint32, error) {
	// Step 1: Send the "get screen" command (OUT, request 0xB5).
	cmdGetScreen := [5]byte{0x51, 0x02, 0x04, 0x1F, 0xFC}
	if err := s.controlOutReq(0xB5, cmdGetScreen[:]); err != nil {
		return 0, fmt.Errorf("send get_screen cmd: %w", err)
	}

	// Step 2: Read 1-byte status (IN, request 0xB6).
	var status [1]byte
	if _, err := s.controlIn(0xB6, status[:]); err != nil {
		return 0, fmt.Errorf("read status: %w", err)
	}

	// Step 3: Read 5-byte response (IN, request 0xB7). Model ID is at bytes 1-4.
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

// controlOutReq sends a vendor-specific USB control OUT transfer with a custom
// request code (not the default 0xB0 used by controlOut).
func (s *winusbSender) controlOutReq(request byte, data []byte) error {
	var pkt [8]byte
	pkt[0] = usbReqTypeOut // 0x40
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
	target := fmt.Sprintf("vid_%04x&pid_%04x", vid, pid)

	r, _, err := procSetupDiGetClassDevsW.Call(
		uintptr(unsafe.Pointer(&guidUSBDevice)),
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

	for i := uint32(0); ; i++ {
		r, _, _ := procSetupDiEnumDeviceInterfaces.Call(
			hDevInfo,
			0,
			uintptr(unsafe.Pointer(&guidUSBDevice)),
			uintptr(i),
			uintptr(unsafe.Pointer(&ifData)),
		)
		if r == 0 {
			break
		}

		// First call: get required buffer size.
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

		// Allocate buffer and populate cbSize for SP_DEVICE_INTERFACE_DETAIL_DATA_W.
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

		// DevicePath starts at byte offset 4 (after the cbSize DWORD), encoded as UTF-16.
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

		if strings.Contains(strings.ToLower(path), target) {
			return path, nil
		}
	}

	return "", fmt.Errorf("VoCore screen (VID=%04X PID=%04X) not found — is the device connected?", vid, pid)
}
