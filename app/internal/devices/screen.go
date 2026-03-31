package devices

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

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

// ScreenConfig stores the user's selected VoCore screen configuration.
// Persisted to ~/.config/Sprint/screen.json.
type ScreenConfig struct {
	// VID / PID identify the selected VoCore USB device.
	VID uint16 `json:"vid"`
	PID uint16 `json:"pid"`
	// Width / Height are the landscape render dimensions for the renderer.
	Width  int `json:"width"`
	Height int `json:"height"`
}

// screenConfigPath returns the path to the persisted screen config file.
func screenConfigPath() string {
	dir, _ := os.UserConfigDir()
	return filepath.Join(dir, "Sprint", "screen.json")
}

// SaveScreenConfig persists cfg to disk.
func SaveScreenConfig(cfg *ScreenConfig) error {
	path := screenConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("devices: mkdir: %w", err)
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("devices: marshal ScreenConfig: %w", err)
	}
	return os.WriteFile(path, data, 0644)
}

// LoadScreenConfig reads the persisted screen config. Returns nil (no error) if
// no config has been saved yet.
func LoadScreenConfig() (*ScreenConfig, error) {
	path := screenConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("devices: read screen config: %w", err)
	}
	var cfg ScreenConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("devices: parse screen config: %w", err)
	}
	return &cfg, nil
}

// DetectedScreen describes a VoCore M-PRO display found by USB enumeration.
type DetectedScreen struct {
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
//   - scan_windows.go — SetupDI (no CGO, no libusb)
//   - scan_usb.go     — gousb/libusb (Linux with CGO)
//   - scan_stub.go    — fallback for unsupported platforms
func ScanScreens() ([]DetectedScreen, error) {
	return scanScreensImpl()
}

// screenFromPID constructs a DetectedScreen for the given VID/PID and optional
// serial string. Unknown PIDs fall back to a 480×800 default.
func screenFromPID(pid uint16, serial string) DetectedScreen {
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

	return DetectedScreen{
		VID:         voCoreVID,
		PID:         pid,
		Serial:      serial,
		Width:       w,
		Height:      h,
		Description: desc,
	}
}
