package main

import (
	"fmt"

	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/app/internal/hardware"
)

// DeviceGetCatalog returns all entries from the embedded device catalog.
func (a *App) DeviceGetCatalog() []devices.CatalogEntry {
	return devices.Catalog()
}

// DeviceGetSavedDevices returns all devices in the registry (online or offline).
func (a *App) DeviceGetSavedDevices() ([]devices.SavedDevice, error) {
	reg, err := a.devMgr.Load()
	if err != nil {
		return nil, fmt.Errorf("DeviceGetSavedDevices: %w", err)
	}
	return reg.Devices, nil
}

// DeviceAdd adds a device to the registry by catalog entry ID.
// Generic entries (VID/PID == 0) trigger a USB scan for the first unregistered
// device of that driver type. Specific entries are added directly from the catalog.
func (a *App) DeviceAdd(catalogID string) error {
	entry, ok := devices.CatalogByID(catalogID)
	if !ok {
		return fmt.Errorf("DeviceAdd: unknown catalog ID %q", catalogID)
	}

	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceAdd: load registry: %w", err)
	}

	saved := entry.ToSavedDevice("")

	if entry.IsGeneric() {
		detected, scanErr := a.scanFirstUnregistered(reg, entry.Driver)
		if scanErr != nil {
			return fmt.Errorf("DeviceAdd: %w", scanErr)
		}
		saved.VID = detected.VID
		saved.PID = detected.PID
		saved.Serial = detected.Serial
		saved.Width = detected.Width
		saved.Height = detected.Height
		if saved.Name == "" || saved.Name == entry.Name {
			saved.Name = detected.Description
		}
	}

	id := devices.DeviceID(saved.VID, saved.PID, saved.Serial)

	// For generic adds (resolved from USB scan), auto-detect rotation when the
	// catalog doesn't specify one but the physical screen is portrait-native.
	if entry.IsGeneric() && saved.Rotation == 0 && saved.Height > saved.Width {
		saved.Rotation = 90
	}

	// Insert or update: never use Upsert here because Upsert always forces
	// Type=DeviceTypeScreen and auto-derives rotation, which would override
	// the catalog's explicit type and rotation for specific entries like wheels.
	existing := devices.FindByID(reg, id)
	if existing != nil {
		// Device already registered (re-add from catalog): refresh dimensions only.
		// Preserve the user's name, rotation, type, and bindings.
		existing.Width = saved.Width
		existing.Height = saved.Height
	} else {
		reg.Devices = append(reg.Devices, saved)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceAdd: save: %w", err)
	}

	device := devices.FindByID(reg, id)
	if device != nil && device.HasScreen() {
		a.coord.SetScreenConfig(id, *device)
	}
	a.coord.ReloadInputBindings()
	return nil
}

// DeviceRemoveDevice removes a device from the registry and stops its driver.
func (a *App) DeviceRemoveDevice(vid, pid uint16, serial string) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceRemoveDevice: load: %w", err)
	}
	id := devices.DeviceID(vid, pid, serial)
	devices.Remove(reg, id)
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceRemoveDevice: save: %w", err)
	}
	a.coord.RemoveDevice(id)
	return nil
}

// DeviceGetScreenStatus returns the live screen connection state:
// "connected" when any USB screen link is active, "disconnected" otherwise.
func (a *App) DeviceGetScreenStatus() string {
	return a.coord.GetScreenStatus()
}

// DeviceRenameDevice updates the user-defined name for the given device.
func (a *App) DeviceRenameDevice(vid, pid uint16, serial, name string) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceRenameDevice: load: %w", err)
	}
	id := devices.DeviceID(vid, pid, serial)
	if err := devices.Rename(reg, id, name); err != nil {
		return fmt.Errorf("DeviceRenameDevice: %w", err)
	}
	return a.devMgr.Save(reg)
}

// DeviceSetScreenRotation updates the rotation for the given device and
// hot-reloads the renderer.
func (a *App) DeviceSetScreenRotation(vid, pid uint16, serial string, rotation int) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSetScreenRotation: load: %w", err)
	}
	id := devices.DeviceID(vid, pid, serial)
	if err := devices.SetRotation(reg, id, rotation); err != nil {
		return fmt.Errorf("DeviceSetScreenRotation: %w", err)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceSetScreenRotation: save: %w", err)
	}
	if d := devices.FindByID(reg, id); d != nil && d.HasScreen() {
		a.coord.SetScreenConfig(id, *d)
	}
	return nil
}

// DeviceSetScreenOffset updates the pixel offset for the given device and
// hot-reloads the renderer. offsetX/offsetY shift the content from the
// left/top edge of the screen respectively.
func (a *App) DeviceSetScreenOffset(vid, pid uint16, serial string, offsetX, offsetY int) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSetScreenOffset: load: %w", err)
	}
	id := devices.DeviceID(vid, pid, serial)
	if err := devices.SetScreenOffset(reg, id, offsetX, offsetY); err != nil {
		return fmt.Errorf("DeviceSetScreenOffset: %w", err)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceSetScreenOffset: save: %w", err)
	}
	if d := devices.FindByID(reg, id); d != nil && d.HasScreen() {
		a.coord.SetScreenConfig(id, *d)
	}
	return nil
}

// DeviceSetDashLayout assigns a dash layout to the given device and hot-reloads
// the renderer immediately.
func (a *App) DeviceSetDashLayout(vid, pid uint16, serial, dashID string) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSetDashLayout: load: %w", err)
	}
	id := devices.DeviceID(vid, pid, serial)
	if err := devices.SetDashLayout(reg, id, dashID); err != nil {
		return fmt.Errorf("DeviceSetDashLayout: %w", err)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceSetDashLayout: save: %w", err)
	}
	if d := devices.FindByID(reg, id); d != nil && d.HasScreen() {
		layout, loadErr := a.dash.Load(dashID)
		if loadErr != nil {
			return fmt.Errorf("DeviceSetDashLayout: load layout: %w", loadErr)
		}
		a.coord.SetDashLayout(id, layout)
	}
	return nil
}

// DeviceGetDeviceBindings returns the button→command bindings for the given device.
func (a *App) DeviceGetDeviceBindings(vid, pid uint16, serial string) ([]devices.DeviceBinding, error) {
	reg, err := a.devMgr.Load()
	if err != nil {
		return nil, fmt.Errorf("DeviceGetDeviceBindings: %w", err)
	}
	id := devices.DeviceID(vid, pid, serial)
	d := devices.FindByID(reg, id)
	if d == nil {
		return nil, fmt.Errorf("DeviceGetDeviceBindings: device %q not found", id)
	}
	if d.Bindings == nil {
		return []devices.DeviceBinding{}, nil
	}
	return d.Bindings, nil
}

// DeviceSaveDeviceBindings persists button→command bindings for the given device.
func (a *App) DeviceSaveDeviceBindings(vid, pid uint16, serial string, bindings []devices.DeviceBinding) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSaveDeviceBindings: load: %w", err)
	}
	id := devices.DeviceID(vid, pid, serial)
	if err := devices.SetDeviceBindings(reg, id, bindings); err != nil {
		return fmt.Errorf("DeviceSaveDeviceBindings: %w", err)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceSaveDeviceBindings: save: %w", err)
	}
	a.coord.ReloadInputBindings()
	return nil
}

// DeviceSetDevicePaused pauses or resumes rendering for the given device.
// When paused the USB handle is released so another app (e.g. SimHub) can
// drive the screen. Sprint resumes when called with false.
func (a *App) DeviceSetDevicePaused(deviceID string, paused bool) {
	a.coord.SetDevicePaused(deviceID, paused)
}

// DeviceGetDevicePaused reports whether the given device's rendering is paused.
func (a *App) DeviceGetDevicePaused(deviceID string) bool {
	return a.coord.GetDevicePaused(deviceID)
}

// scanFirstUnregistered scans USB for the first device of the given driver type
// that is not already present in the registry.
func (a *App) scanFirstUnregistered(reg *devices.DeviceRegistry, driver devices.DriverType) (devices.DetectedScreen, error) {
	switch driver {
	case devices.DriverVoCore:
		screens, err := hardware.ScanVoCore()
		if err != nil {
			return devices.DetectedScreen{}, fmt.Errorf("scan vocore: %w", err)
		}
		for _, s := range screens {
			id := devices.DeviceID(s.VID, s.PID, s.Serial)
			if devices.FindByID(reg, id) == nil {
				return devices.DetectedScreen{
					VID: s.VID, PID: s.PID, Serial: s.Serial,
					Width: s.Width, Height: s.Height, Description: s.Description,
					Driver: devices.DriverVoCore,
				}, nil
			}
		}
		return devices.DetectedScreen{}, fmt.Errorf("no unregistered VoCore device found")
	case devices.DriverUSBD480:
		screens, err := hardware.ScanUSBD480()
		if err != nil {
			return devices.DetectedScreen{}, fmt.Errorf("scan usbd480: %w", err)
		}
		for _, s := range screens {
			id := devices.DeviceID(s.VID, s.PID, s.Serial)
			if devices.FindByID(reg, id) == nil {
				return devices.DetectedScreen{
					VID: s.VID, PID: s.PID, Serial: s.Serial,
					Width: s.Width, Height: s.Height, Description: s.Description,
					Driver: devices.DriverUSBD480,
				}, nil
			}
		}
		return devices.DetectedScreen{}, fmt.Errorf("no unregistered USBD480 device found")
	default:
		return devices.DetectedScreen{}, fmt.Errorf("unknown driver type %q", driver)
	}
}
