//go:build windows

package hardware

import (
	"fmt"
	"log/slog"
	"syscall"
	"unsafe"
)

// USBD480 USB protocol constants (from usbd480fb Linux driver / User Guide).
const (
	usbd480ReqGetDetails  = 0x80 // control IN:  64-byte device info (name, width, height)
	usbd480ReqSetAddr     = 0xC0 // control OUT: set framebuffer write address
	usbd480ReqSetFrame    = 0xC4 // control OUT: set frame start address (flip)
	usbd480ReqBrightness  = 0x81 // control OUT: set backlight brightness; wValue = level (0=off, 255=full)

	// bmRequestType bytes.
	// The NX series uses USB_RECIP_DEVICE (not RECIP_INTERFACE like the old WQ43):
	// USB_DIR_OUT | USB_TYPE_VENDOR | USB_RECIP_DEVICE = 0x00 | 0x40 | 0x00 = 0x40
	// USB_DIR_IN  | USB_TYPE_VENDOR | USB_RECIP_DEVICE = 0x80 | 0x40 | 0x00 = 0xC0
	usbd480ReqTypeOut = 0x40
	usbd480ReqTypeIn  = 0xC0

	usbd480BulkEP = 0x02 // bulk OUT endpoint
)

// GUID_DEVINTERFACE_WINUSB {DEE824EF-729B-4A0E-9C14-B7117D33A817}
// Windows registers this GUID automatically when WinUSB is bound to a device
// interface (including per-interface installs on composite devices).
var guidWinUSBDevice = winGUID{
	Data1: 0xDEE824EF,
	Data2: 0x729B,
	Data3: 0x4A0E,
	Data4: [8]byte{0x9C, 0x14, 0xB7, 0x11, 0x7D, 0x33, 0xA8, 0x17},
}

// findUSBD480DevicePath returns the Windows device path for the USBD480 NX screen.
//
// Only GUID_DEVINTERFACE_WINUSB is used — it is exclusively registered when WinUSB
// is the active function driver. GUID_DEVINTERFACE_USB_DEVICE also lists the raw
// usbccgp.sys composite parent, and WinUsb_Initialize partially succeeds on it
// (IN transfers work; OUT transfers fail because the parent device is not WinUSB).
//
// Per-interface installs (Zadig → Interface 0, path contains &mi_00) work correctly
// for both IN and OUT transfers once the NULL buffer bug is avoided. Whole-device
// installs are still preferred when both coexist.
func findUSBD480DevicePath(vid, pid uint16) (string, error) {
	path, err := findUSBDevicePathWithGUID(vid, pid, &guidWinUSBDevice)
	if err != nil {
		return "", fmt.Errorf("USBD480 NX (VID=%04X PID=%04X) not found — connect the screen and install WinUSB via Zadig or the Sprint driver installer", vid, pid)
	}
	return path, nil
}

type usbd480Sender struct {
	devHandle    syscall.Handle
	winusbHandle uintptr
	nativeW      int
	nativeH      int
	logger       *slog.Logger
}

// openUSBD480Screen opens a WinUSB connection to the USBD480 display.
// The device must have WinUSB bound to it (use Zadig or a custom INF).
// Actual screen dimensions are queried from the device via GET_DEVICE_DETAILS.
func openUSBD480Screen(vid, pid uint16, width, height int, logger *slog.Logger) (screenTransport, error) {
	if err := modWinUSB.Load(); err != nil {
		return nil, fmt.Errorf("WinUSB not available: %w", err)
	}

	path, err := findUSBD480DevicePath(vid, pid)
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
		return nil, fmt.Errorf("open USBD480 device: %w (ensure WinUSB driver is bound — use Zadig)", err)
	}

	var winusbHandle uintptr
	r, _, callErr := procWinUsbInitialize.Call(
		uintptr(devHandle),
		uintptr(unsafe.Pointer(&winusbHandle)),
	)
	if r == 0 {
		syscall.CloseHandle(devHandle)
		if isDriverNotBoundError(callErr) {
			return nil, fmt.Errorf("%w: VID=%04X PID=%04X — use Zadig or run the Sprint driver installer", ErrDriverNotInstalled, vid, pid)
		}
		return nil, fmt.Errorf("WinUsb_Initialize USBD480: %w", callErr)
	}

	// Wake the device from USB selective suspend. When another application (e.g.
	// SimHub) disables the screen and closes its handle, the WinUSB driver leaves
	// the device in AUTO_SUSPEND mode. WinUsb_Initialize succeeds (opens the
	// interface) but all transfers fail with ERROR_GEN_FAILURE until the device
	// is woken. Setting AUTO_SUSPEND=FALSE forces the host to bring the device
	// back to full power immediately.
	//
	// POWER_POLICY_TYPE AUTO_SUSPEND = 0x81 (from winusbio.h)
	var autoSuspendOff uint8 = 0
	procWinUsbSetPowerPolicy.Call(
		winusbHandle,
		0x81, // AUTO_SUSPEND
		1,
		uintptr(unsafe.Pointer(&autoSuspendOff)),
	)

	s := &usbd480Sender{
		devHandle:    devHandle,
		winusbHandle: winusbHandle,
		nativeW:      width,
		nativeH:      height,
		logger:       logger,
	}

	// Query actual screen dimensions and name from the device.
	if w, h, name, err := s.queryDeviceDetails(); err == nil {
		logger.Info("USBD480 device identified",
			"name", name,
			"native", fmt.Sprintf("%dx%d", w, h))
		s.nativeW = w
		s.nativeH = h
	} else {
		logger.Warn("USBD480 GET_DEVICE_DETAILS failed, using configured dimensions",
			"err", err,
			"fallback", fmt.Sprintf("%dx%d", width, height))
	}

	_, err = validateScreenSize(s.nativeW, s.nativeH)
	if err != nil {
		s.close()
		return nil, err
	}

	logger.Info("USBD480 screen opened",
		"vid", fmt.Sprintf("0x%04X", vid),
		"pid", fmt.Sprintf("0x%04X", pid),
		"native", fmt.Sprintf("%dx%d", s.nativeW, s.nativeH))

	// Restore full brightness — SimHub (and our own close) set it to 0 on disable.
	s.setBrightness(255)

	return s, nil
}

// send transmits a full RGB565 frame to the USBD480:
//  1. SET_ADDRESS(0) — point write cursor at frame start
//  2. Bulk write  — raw RGB565 pixel data
//  3. SET_FRAME_START_ADDRESS(0) — flip display to show the written frame
func (s *usbd480Sender) send(rgb565 []byte) error {
	if err := s.controlOut(usbd480ReqSetAddr, 0, 0); err != nil {
		return fmt.Errorf("USBD480 set address: %w", err)
	}

	var transferred uint32
	r, _, err := procWinUsbWritePipe.Call(
		s.winusbHandle,
		uintptr(usbd480BulkEP),
		uintptr(unsafe.Pointer(&rgb565[0])),
		uintptr(len(rgb565)),
		uintptr(unsafe.Pointer(&transferred)),
		0,
	)
	if r == 0 {
		return fmt.Errorf("USBD480 bulk write: %w", err)
	}

	if err := s.controlOut(usbd480ReqSetFrame, 0, 0); err != nil {
		return fmt.Errorf("USBD480 set frame start: %w", err)
	}
	return nil
}

func (s *usbd480Sender) nativeSize() (int, int) { return s.nativeW, s.nativeH }

func (s *usbd480Sender) close() {
	// Dim backlight before release — same mechanism SimHub uses to "disable" the screen.
	s.setBrightness(0)
	procWinUsbFree.Call(s.winusbHandle)
	syscall.CloseHandle(s.devHandle)
	s.logger.Info("USBD480 screen closed")
}

// setBrightness sets the USBD480 backlight level (0 = off, 255 = full).
// Per the official usbd480fb Linux driver: bRequest=0x81, wValue=brightness, no data.
func (s *usbd480Sender) setBrightness(level uint16) {
	if err := s.controlOut(usbd480ReqBrightness, level, 0); err != nil {
		s.logger.Warn("USBD480 set brightness failed (non-fatal)", "err", err, "level", level)
	}
}

// controlOut sends a vendor OUT control transfer (RECIP_INTERFACE) to the USBD480.
// wValue and wIndex encode a 32-bit address: wValue = addr[15:0], wIndex = addr[31:16].
//
// A non-NULL buffer pointer is required even for zero-length transfers — WinUSB on
// composite devices rejects NULL buffers for OUT control transfers regardless of what
// the documentation states. libusb exhibits the same behavior (always passes a valid
// pointer even when size=0).
func (s *usbd480Sender) controlOut(request byte, wValue, wIndex uint16) error {
	var pkt [8]byte
	pkt[0] = usbd480ReqTypeOut
	pkt[1] = request
	pkt[2] = byte(wValue)
	pkt[3] = byte(wValue >> 8)
	pkt[4] = byte(wIndex)
	pkt[5] = byte(wIndex >> 8)
	// pkt[6:8] = wLength = 0

	var dummy [1]byte // non-NULL buffer required even for zero-length OUT transfers
	var transferred uint32
	r, _, err := procWinUsbControlTransfer.Call(
		s.winusbHandle,
		*(*uintptr)(unsafe.Pointer(&pkt[0])),
		uintptr(unsafe.Pointer(&dummy[0])),
		0,
		uintptr(unsafe.Pointer(&transferred)),
		0,
	)
	if r == 0 {
		return fmt.Errorf("WinUsb_ControlTransfer OUT 0x%02X: %w", request, err)
	}
	return nil
}

// queryDeviceDetails sends GET_DEVICE_DETAILS (0x80) to the USBD480 and returns
// the screen width, height, and device name string.
//
// Response layout (64 bytes):
//
//	[0:20]  device name (null-terminated ASCII)
//	[20:22] width  (little-endian uint16)
//	[22:24] height (little-endian uint16)
func (s *usbd480Sender) queryDeviceDetails() (width, height int, name string, err error) {
	var pkt [8]byte
	pkt[0] = usbd480ReqTypeIn
	pkt[1] = usbd480ReqGetDetails
	pkt[6] = 64 // wLength = 64

	buf := make([]byte, 64)
	var transferred uint32
	r, _, callErr := procWinUsbControlTransfer.Call(
		s.winusbHandle,
		*(*uintptr)(unsafe.Pointer(&pkt[0])),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)),
		uintptr(unsafe.Pointer(&transferred)),
		0,
	)
	if r == 0 {
		return 0, 0, "", fmt.Errorf("GET_DEVICE_DETAILS: %w", callErr)
	}
	if int(transferred) < 24 {
		return 0, 0, "", fmt.Errorf("GET_DEVICE_DETAILS: short response (%d bytes)", transferred)
	}

	w := int(buf[20]) | int(buf[21])<<8
	h := int(buf[22]) | int(buf[23])<<8

	end := 20
	for i, b := range buf[:20] {
		if b == 0 {
			end = i
			break
		}
	}
	return w, h, string(buf[:end]), nil
}
