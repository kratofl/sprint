package main

import (
	"fmt"

	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/app/internal/hardware"
)

// DeviceScanScreens scans USB for connected display screens (VoCore M-PRO and
// USBD480) and returns them as hardware-agnostic DetectedScreens. Errors from
// individual scanners are logged but do not prevent other scanners from running.
func (a *App) DeviceScanScreens() ([]devices.DetectedScreen, error) {
	var out []devices.DetectedScreen

	if vocore, err := hardware.ScanVoCore(); err == nil {
		for _, s := range vocore {
			out = append(out, devices.DetectedScreen{
				VID:         s.VID,
				PID:         s.PID,
				Serial:      s.Serial,
				Width:       s.Width,
				Height:      s.Height,
				Description: s.Description,
				Driver:      devices.DriverVoCore,
			})
		}
	}

	if usbd480, err := hardware.ScanUSBD480(); err == nil {
		for _, s := range usbd480 {
			out = append(out, devices.DetectedScreen{
				VID:         s.VID,
				PID:         s.PID,
				Serial:      s.Serial,
				Width:       s.Width,
				Height:      s.Height,
				Description: s.Description,
				Driver:      devices.DriverUSBD480,
			})
		}
	}

	return out, nil
}

// DeviceGetSavedScreens returns all screens in the registry, including those
// that are currently offline.
func (a *App) DeviceGetSavedScreens() ([]devices.SavedScreen, error) {
	reg, err := a.devMgr.Load()
	if err != nil {
		return nil, fmt.Errorf("DeviceGetSavedScreens: %w", err)
	}
	return reg.Screens, nil
}

// DeviceGetScreen returns the currently active saved screen, or nil if none
// has been selected yet.
func (a *App) DeviceGetScreen() (*devices.SavedScreen, error) {
	reg, err := a.devMgr.Load()
	if err != nil {
		return nil, fmt.Errorf("DeviceGetScreen: %w", err)
	}
	return devices.ActiveScreen(reg), nil
}

// DeviceGetScreenStatus returns the live screen connection state:
// "connected" when the USB link is active, "disconnected" otherwise.
func (a *App) DeviceGetScreenStatus() string {
	return a.coord.GetScreenStatus()
}

// DeviceSelectScreen activates the given screen: upserts it into the registry,
// marks it as active, saves, and hot-reloads the renderer.
func (a *App) DeviceSelectScreen(vid, pid uint16, serial string, width, height int, driver devices.DriverType) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSelectScreen: load: %w", err)
	}
	detected := devices.DetectedScreen{
		VID:    vid,
		PID:    pid,
		Serial: serial,
		Width:  width,
		Height: height,
		Driver: driver,
	}
	devices.Upsert(reg, detected)
	reg.ActiveID = devices.ScreenID(vid, pid, serial)
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceSelectScreen: save: %w", err)
	}
	active := devices.ActiveScreen(reg)
	if active != nil {
		a.coord.SetScreenConfig(devices.ToScreenConfig(active))
	}
	return nil
}

// DeviceRenameScreen updates the user-defined name for the given screen.
func (a *App) DeviceRenameScreen(vid, pid uint16, serial, name string) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceRenameScreen: load: %w", err)
	}
	id := devices.ScreenID(vid, pid, serial)
	if err := devices.Rename(reg, id, name); err != nil {
		return fmt.Errorf("DeviceRenameScreen: %w", err)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceRenameScreen: save: %w", err)
	}
	return nil
}

// DeviceSetScreenRotation updates the rotation for the given screen and
// hot-reloads the renderer if it is the active screen.
func (a *App) DeviceSetScreenRotation(vid, pid uint16, serial string, rotation int) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSetScreenRotation: load: %w", err)
	}
	id := devices.ScreenID(vid, pid, serial)
	if err := devices.SetRotation(reg, id, rotation); err != nil {
		return fmt.Errorf("DeviceSetScreenRotation: %w", err)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceSetScreenRotation: save: %w", err)
	}
	if reg.ActiveID == id {
		if active := devices.ActiveScreen(reg); active != nil {
			a.coord.SetScreenConfig(devices.ToScreenConfig(active))
		}
	}
	return nil
}

// DeviceSetDashLayout assigns a dash layout to the given screen and hot-reloads
// the renderer if it is the active screen.
func (a *App) DeviceSetDashLayout(vid, pid uint16, serial, dashID string) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSetDashLayout: load: %w", err)
	}
	id := devices.ScreenID(vid, pid, serial)
	if err := devices.SetDashLayout(reg, id, dashID); err != nil {
		return fmt.Errorf("DeviceSetDashLayout: %w", err)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceSetDashLayout: save: %w", err)
	}
	if reg.ActiveID == id {
		layout, loadErr := a.dash.Load(dashID)
		if loadErr != nil {
			return fmt.Errorf("DeviceSetDashLayout: load layout: %w", loadErr)
		}
		a.coord.SetDashLayout(layout)
	}
	return nil
}

// DeviceGetDeviceBindings returns the button→command bindings for the given screen.
func (a *App) DeviceGetDeviceBindings(vid, pid uint16, serial string) ([]devices.DeviceBinding, error) {
	reg, err := a.devMgr.Load()
	if err != nil {
		return nil, fmt.Errorf("DeviceGetDeviceBindings: %w", err)
	}
	id := devices.ScreenID(vid, pid, serial)
	s := devices.FindByID(reg, id)
	if s == nil {
		return nil, fmt.Errorf("DeviceGetDeviceBindings: screen %q not found", id)
	}
	if s.Bindings == nil {
		return []devices.DeviceBinding{}, nil
	}
	return s.Bindings, nil
}

// DeviceSaveDeviceBindings persists button→command bindings for the given screen.
func (a *App) DeviceSaveDeviceBindings(vid, pid uint16, serial string, bindings []devices.DeviceBinding) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSaveDeviceBindings: load: %w", err)
	}
	id := devices.ScreenID(vid, pid, serial)
	if err := devices.SetDeviceBindings(reg, id, bindings); err != nil {
		return fmt.Errorf("DeviceSaveDeviceBindings: %w", err)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceSaveDeviceBindings: save: %w", err)
	}
	// Push updated bindings to the input dispatcher immediately.
	a.coord.ReloadInputBindings()
	return nil
}
// When paused, the USB handle is released so another application (e.g., SimHub)
// can drive the screen. Sprint resumes automatically when called with false.
func (a *App) DeviceSetScreenPaused(paused bool) {
	a.coord.SetScreenPaused(paused)
}

// DeviceGetScreenPaused reports whether Sprint's screen output is currently paused.
func (a *App) DeviceGetScreenPaused() bool {
	return a.coord.GetScreenPaused()
}
