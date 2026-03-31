// Package devices — VoCore screen detection and configuration.
// This file defines the DetectedVoCoreScreen type and the internal
// PID → native dimensions lookup used by all platform-specific scanners.
package devices

import "fmt"

// voCoreVID is the USB Vendor ID shared by all VoCore M-PRO display devices.
const voCoreVID uint16 = 0xC872

// voCorePIDDimensions maps VoCore screen USB PIDs to their native pixel
// dimensions (width × height in portrait orientation as reported by the device).
// This is an internal table; users never interact with it directly.
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
// The scanner returns one entry for each connected VoCore screen.
type DetectedVoCoreScreen struct {
	// VID is the USB Vendor ID (always 0xC872).
	VID uint16 `json:"vid"`
	// PID is the USB Product ID; determines the screen model and dimensions.
	PID uint16 `json:"pid"`
	// Serial is the USB serial number string reported by the device; may be empty.
	Serial string `json:"serial,omitempty"`
	// Width and Height are the render dimensions for this screen.
	// These are the landscape render dimensions — portrait-native screens
	// will be auto-rotated by the renderer.
	Width  int `json:"width"`
	Height int `json:"height"`
	// Description is a human-readable summary shown in the UI.
	Description string `json:"description"`
}

// voCoreScreenFromPID constructs a DetectedVoCoreScreen for the given VID/PID
// and optional serial string, using the internal PID dimension table.
// If the PID is unknown, a sensible default (480×800) is used.
func voCoreScreenFromPID(pid uint16, serial string) DetectedVoCoreScreen {
	dims, ok := voCorePIDDimensions[pid]
	if !ok {
		dims = [2]int{480, 800} // safe default for unrecognised PIDs
	}

	// The renderer works in landscape. If native is portrait (h > w), swap for
	// the display description so the user sees the landscape render size.
	w, h := dims[0], dims[1]
	if h > w {
		w, h = h, w // present as landscape
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
