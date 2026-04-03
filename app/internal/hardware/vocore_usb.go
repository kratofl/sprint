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
	"errors"
	"fmt"
	"image"
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

// VoCore M-PRO screen USB protocol constants (from mpro_drm driver).
const (
	usbBulkEndpoint = 0x02 // bulk OUT endpoint for pixel data
	usbVendorReq    = 0xB0 // vendor-specific control request
	usbReqTypeOut   = 0x40 // USB_DIR_OUT | USB_TYPE_VENDOR | USB_RECIP_DEVICE

	// maxScreenPixels is a sanity cap to prevent integer overflow in
	// width*height*2. 4096×4096 = 16 M pixels × 2 = 32 MB, well above
	// any real VoCore screen (800×480 = 768 KB).
	maxScreenPixels = 4096 * 4096
)

// errScreenTransportUnsupported indicates that no platform transport is
// implemented for sending frames to the VoCore screen.
var errScreenTransportUnsupported = errors.New("vocore screen transport unsupported on this platform")

// screenTransport sends rendered frames to the VoCore screen over USB.
type screenTransport interface {
	send(rgb565 []byte) error
	close()
	// nativeSize returns the screen's actual native pixel dimensions as
	// reported by the device. These may differ from the configured
	// ScreenConfig (e.g. 480×800 portrait vs 800×480 landscape).
	nativeSize() (width, height int)
}

// validateScreenSize checks that width/height are positive and that
// width*height*2 (RGB565) does not overflow a reasonable buffer size.
func validateScreenSize(width, height int) (frameBytes int, err error) {
	if width <= 0 || height <= 0 {
		return 0, fmt.Errorf("invalid screen dimensions: %dx%d", width, height)
	}
	pixels := width * height
	if pixels > maxScreenPixels || pixels/width != height {
		return 0, fmt.Errorf("screen dimensions too large: %dx%d (%d pixels)", width, height, pixels)
	}
	return pixels * 2, nil
}

// openScreen dispatches to the appropriate USB transport based on cfg.DriverType.
func openScreen(cfg VoCoreConfig, logger *slog.Logger) (screenTransport, error) {
	if cfg.DriverType == "usbd480" {
		return openUSBD480Screen(cfg.VID, cfg.PID, cfg.Width, cfg.Height, logger)
	}
	return openVoCoreScreen(cfg.VID, cfg.PID, cfg.Width, cfg.Height, logger)
}

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

func (s *winusbSender) close() {
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

		if strings.Contains(strings.ToLower(path), target) {
			return path, nil
		}
	}

	return "", fmt.Errorf("VoCore screen (VID=%04X PID=%04X) not found — is the device connected?", vid, pid)
}

// imageToRGB565 converts an image to RGB565 little-endian, writing into dst.
// dst must be at least width*height*2 bytes. Uses a fast path for *image.RGBA
// which is the output type of fogleman/gg.
func imageToRGB565(img image.Image, dst []byte) {
	bounds := img.Bounds()

	if rgba, ok := img.(*image.RGBA); ok {
		i := 0
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			off := (y - rgba.Rect.Min.Y) * rgba.Stride
			for x := bounds.Min.X; x < bounds.Max.X; x++ {
				j := off + (x-rgba.Rect.Min.X)*4
				r := uint16(rgba.Pix[j]) >> 3
				g := uint16(rgba.Pix[j+1]) >> 2
				b := uint16(rgba.Pix[j+2]) >> 3
				px := (r << 11) | (g << 5) | b
				dst[i] = byte(px)
				dst[i+1] = byte(px >> 8)
				i += 2
			}
		}
		return
	}

	i := 0
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, _ := img.At(x, y).RGBA()
			r5 := uint16(r >> 11)
			g6 := uint16(g >> 10)
			b5 := uint16(b >> 11)
			px := (r5 << 11) | (g6 << 5) | b5
			dst[i] = byte(px)
			dst[i+1] = byte(px >> 8)
			i += 2
		}
	}
}

// imageToRGB565CW90 converts an image to RGB565 little-endian with a 90° CW
// rotation. Source image W×H becomes output H×W.
// dst must be at least W*H*2 bytes.
func imageToRGB565CW90(img image.Image, dst []byte) {
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	if rgba, ok := img.(*image.RGBA); ok {
		i := 0
		for dy := 0; dy < srcW; dy++ {
			for dx := 0; dx < srcH; dx++ {
				sx := dy
				sy := srcH - 1 - dx
				j := (sy-rgba.Rect.Min.Y)*rgba.Stride + (sx-rgba.Rect.Min.X)*4
				r := uint16(rgba.Pix[j]) >> 3
				g := uint16(rgba.Pix[j+1]) >> 2
				b := uint16(rgba.Pix[j+2]) >> 3
				px := (r << 11) | (g << 5) | b
				dst[i] = byte(px)
				dst[i+1] = byte(px >> 8)
				i += 2
			}
		}
		return
	}

	i := 0
	for dy := 0; dy < srcW; dy++ {
		for dx := 0; dx < srcH; dx++ {
			sx := bounds.Min.X + dy
			sy := bounds.Min.Y + srcH - 1 - dx
			r, g, b, _ := img.At(sx, sy).RGBA()
			px := (uint16(r>>11) << 11) | (uint16(g>>10) << 5) | uint16(b>>11)
			dst[i] = byte(px)
			dst[i+1] = byte(px >> 8)
			i += 2
		}
	}
}

// imageToRGB565CW180 converts an image to RGB565 little-endian with a 180°
// rotation. Output dimensions match input (W×H).
// dst must be at least W*H*2 bytes.
func imageToRGB565CW180(img image.Image, dst []byte) {
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	if rgba, ok := img.(*image.RGBA); ok {
		i := 0
		for y := srcH - 1; y >= 0; y-- {
			for x := srcW - 1; x >= 0; x-- {
				sy := bounds.Min.Y + y
				sx := bounds.Min.X + x
				j := (sy-rgba.Rect.Min.Y)*rgba.Stride + (sx-rgba.Rect.Min.X)*4
				r := uint16(rgba.Pix[j]) >> 3
				g := uint16(rgba.Pix[j+1]) >> 2
				b := uint16(rgba.Pix[j+2]) >> 3
				px := (r << 11) | (g << 5) | b
				dst[i] = byte(px)
				dst[i+1] = byte(px >> 8)
				i += 2
			}
		}
		return
	}

	i := 0
	for y := srcH - 1; y >= 0; y-- {
		for x := srcW - 1; x >= 0; x-- {
			sx := bounds.Min.X + x
			sy := bounds.Min.Y + y
			r, g, b, _ := img.At(sx, sy).RGBA()
			px := (uint16(r>>11) << 11) | (uint16(g>>10) << 5) | uint16(b>>11)
			dst[i] = byte(px)
			dst[i+1] = byte(px >> 8)
			i += 2
		}
	}
}

// imageToRGB565CW270 converts an image to RGB565 little-endian with a 270° CW
// (90° CCW) rotation. Source image W×H becomes output H×W.
// dst must be at least W*H*2 bytes.
func imageToRGB565CW270(img image.Image, dst []byte) {
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	if rgba, ok := img.(*image.RGBA); ok {
		i := 0
		for dy := 0; dy < srcW; dy++ {
			for dx := 0; dx < srcH; dx++ {
				sx := bounds.Min.X + (srcW - 1 - dy)
				sy := bounds.Min.Y + dx
				j := (sy-rgba.Rect.Min.Y)*rgba.Stride + (sx-rgba.Rect.Min.X)*4
				r := uint16(rgba.Pix[j]) >> 3
				g := uint16(rgba.Pix[j+1]) >> 2
				b := uint16(rgba.Pix[j+2]) >> 3
				px := (r << 11) | (g << 5) | b
				dst[i] = byte(px)
				dst[i+1] = byte(px >> 8)
				i += 2
			}
		}
		return
	}

	i := 0
	for dy := 0; dy < srcW; dy++ {
		for dx := 0; dx < srcH; dx++ {
			sx := bounds.Min.X + (srcW - 1 - dy)
			sy := bounds.Min.Y + dx
			r, g, b, _ := img.At(sx, sy).RGBA()
			px := (uint16(r>>11) << 11) | (uint16(g>>10) << 5) | uint16(b>>11)
			dst[i] = byte(px)
			dst[i+1] = byte(px >> 8)
			i += 2
		}
	}
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
