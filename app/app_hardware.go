package main

import (
	"fmt"

	"github.com/kratofl/sprint/app/internal/hardware"
)

// DeviceScanScreens scans USB for connected VoCore M-PRO screens and returns
// the list. On unsupported platforms (e.g. macOS without gousb) this returns
// an empty list without an error.
func (a *App) DeviceScanScreens() ([]hardware.VoCoreScreen, error) {
	screens, err := hardware.ScanVoCore()
	if err != nil {
		return nil, fmt.Errorf("DeviceScanScreens: %w", err)
	}
	return screens, nil
}

// DeviceGetScreen returns the currently saved VoCore screen configuration.
// Returns nil (no error) if no screen has been selected yet.
func (a *App) DeviceGetScreen() (*hardware.VoCoreConfig, error) {
	cfg, err := hardware.LoadVoCoreConfig()
	if err != nil {
		return nil, fmt.Errorf("DeviceGetScreen: %w", err)
	}
	return cfg, nil
}

// DeviceSelectScreen saves the chosen VoCore screen by VID/PID and dimensions,
// then hot-reloads the renderer so the new screen takes effect immediately.
func (a *App) DeviceSelectScreen(vid, pid uint16, width, height int) error {
	cfg := &hardware.VoCoreConfig{VID: vid, PID: pid, Width: width, Height: height}
	if err := hardware.SaveVoCoreConfig(cfg); err != nil {
		return fmt.Errorf("DeviceSelectScreen: %w", err)
	}
	a.coord.SetScreenConfig(cfg)
	return nil
}
