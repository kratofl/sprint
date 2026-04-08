package hardware

import "fmt"

const (
	usbd480VID uint16 = 0x16C0
	usbd480PID uint16 = 0x08A7

	// usbd480DefaultWidth / Height are the fallback render dimensions used when
	// WinUSB is not yet installed and the device cannot be queried. The actual
	// dimensions are fetched from the device via GET_DEVICE_DETAILS on first connect.
	usbd480DefaultWidth  = 800
	usbd480DefaultHeight = 480
)

// USBD480Screen describes a USBD480 display found by USB enumeration.
type USBD480Screen struct {
	VID         uint16 `json:"vid"`
	PID         uint16 `json:"pid"`
	Serial      string `json:"serial,omitempty"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
	Description string `json:"description"`
}

// ScanUSBD480 enumerates connected USBD480 displays over USB.
// Platform-specific implementations:
//   - usbd480_scan_windows.go — SetupDI (no CGO, no libusb)
//   - usbd480_scan_stub.go    — fallback for unsupported platforms
func ScanUSBD480() ([]USBD480Screen, error) {
	return scanUSBD480Impl()
}

// usbd480ScreenDefault returns an USBD480Screen with default dimensions for a
// given serial, used when the device cannot be queried at scan time.
func usbd480ScreenDefault(serial string) USBD480Screen {
	desc := fmt.Sprintf("USBD480 NX · %d×%d", usbd480DefaultWidth, usbd480DefaultHeight)
	if serial != "" {
		desc += fmt.Sprintf(" [%s]", serial)
	}
	return USBD480Screen{
		VID:         usbd480VID,
		PID:         usbd480PID,
		Serial:      serial,
		Width:       usbd480DefaultWidth,
		Height:      usbd480DefaultHeight,
		Description: desc,
	}
}
