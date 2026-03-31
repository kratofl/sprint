// Package vocore — VoCore screen discovery types and USB dimension table.
// This file defines DetectedVoCoreScreen and the PID→dimension table used
// by all platform-specific scan implementations.
package vocore

import "fmt"

// voCoreVID is the USB Vendor ID shared by all VoCore M-PRO display devices.
const voCoreVID uint16 = 0xC872

// voCorePIDDimensions maps VoCore screen USB PIDs to their native pixel
// dimensions (width × height in portrait orientation as reported by the device).
var voCorePIDDimensions = map[uint16][2]int{
	0x1001: {480, 800},  // M-PRO 4"
	0x1002: {480, 800},  // M-PRO 4.3"
	0x1003: {480, 800},  // M-PRO 4" (alt)
	0x1004: {480, 800},  // M-PRO 4" / 6.8" landscape (BST Omega etc.)
	0x1005: {480, 854},  // M-PRO 5"
	0x1006: {800, 800},  // M-PRO 3.4" square
	0x100A: {1024, 600}, // M-PRO 10"
}

// DetectedVoCoreScreen describes a VoCore M-PRO display found by USB enumeration.
// One entry is returned per connected VoCore screen.
type DetectedVoCoreScreen struct {
	// VID is the USB Vendor ID (always 0xC872).
	VID uint16 `json:"vid"`
	// PID is the USB Product ID; determines the screen model and dimensions.
	PID uint16 `json:"pid"`
	// Serial is the USB serial number string reported by the device; may be empty.
	Serial string `json:"serial,omitempty"`
	// Width and Height are the landscape render dimensions for this screen.
	Width  int `json:"width"`
	Height int `json:"height"`
	// Description is a human-readable summary shown in the UI.
	Description string `json:"description"`
}

// ScanScreens enumerates connected VoCore M-PRO screens over USB.
// Platform-specific implementations:
//   - screen_scan_windows.go — SetupDI (no CGO, no libusb)
//   - screen_scan_usb.go     — gousb/libusb (Linux with CGO)
//   - screen_scan_stub.go    — fallback for unsupported platforms
func ScanScreens() ([]DetectedVoCoreScreen, error) {
	return scanScreensImpl()
}

// voCoreScreenFromPID constructs a DetectedVoCoreScreen for the given VID/PID
// and optional serial string. Unknown PIDs fall back to a 480×800 default.
func voCoreScreenFromPID(pid uint16, serial string) DetectedVoCoreScreen {
	dims, ok := voCorePIDDimensions[pid]
	if !ok {
		dims = [2]int{480, 800}
	}

	// Present in landscape orientation (swap if portrait-native h > w).
	w, h := dims[0], dims[1]
	if h > w {
		w, h = h, w
	}

	desc := fmt.Sprintf("VoCore Screen · %d×%d", w, h)
	if serial != "" {
		desc += fmt.Sprintf(" [%s]", serial)
	}

	return DetectedVoCoreScreen{
		VID:         voCoreVID,
		PID:         pid,
		Serial:      serial,
		Width:       w,
		Height:      h,
		Description: desc,
	}
}
