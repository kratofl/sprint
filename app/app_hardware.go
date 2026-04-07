package main

import (
	"encoding/json"
	"fmt"

	"github.com/kratofl/sprint/app/internal/capture"
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

// DeviceSetPurpose updates the purpose for the given device and persists it.
// Hot-reloads the driver so the new purpose takes effect immediately.
func (a *App) DeviceSetPurpose(vid, pid uint16, serial string, purpose devices.DevicePurpose) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSetPurpose: load: %w", err)
	}
	id := devices.DeviceID(vid, pid, serial)
	if err := devices.SetPurpose(reg, id, purpose); err != nil {
		return fmt.Errorf("DeviceSetPurpose: %w", err)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceSetPurpose: save: %w", err)
	}
	if d := devices.FindByID(reg, id); d != nil && d.HasScreen() {
		a.coord.SetScreenConfig(id, *d)
	}
	return nil
}

// DeviceSetPurposeConfig updates the purpose-specific config JSON blob for the
// given device and persists it. config must be a valid JSON object or null.
func (a *App) DeviceSetPurposeConfig(vid, pid uint16, serial string, config []byte) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSetPurposeConfig: load: %w", err)
	}
	id := devices.DeviceID(vid, pid, serial)
	if err := devices.SetPurposeConfig(reg, id, config); err != nil {
		return fmt.Errorf("DeviceSetPurposeConfig: %w", err)
	}
	return a.devMgr.Save(reg)
}

// DeviceSelectCaptureRegion opens a native overlay window on the primary monitor
// so the user can drag-position and resize an aspect-ratio-locked selection
// rectangle. On confirm the capture region is saved to the device's PurposeConfig
// and the driver is hot-reloaded. On cancel no change is made.
func (a *App) DeviceSelectCaptureRegion(vid, pid uint16, serial string) error {
	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceSelectCaptureRegion: load: %w", err)
	}
	id := devices.DeviceID(vid, pid, serial)
	d := devices.FindByID(reg, id)
	if d == nil {
		return fmt.Errorf("DeviceSelectCaptureRegion: device %q not found", id)
	}

	// Aspect ratio from native screen dims — rotation is a render pipeline concern,
	// not a capture region concern.
	aspectW, aspectH := d.Width, d.Height

	// Pass the existing capture region as the initial overlay position/size
	// so the overlay opens over the previously confirmed area.
	var initX, initY, initW, initH int
	if d.PurposeConfig != nil {
		var rv devices.RearViewConfig
		if json.Unmarshal(d.PurposeConfig, &rv) == nil && rv.CaptureW > 0 && rv.CaptureH > 0 {
			initX, initY, initW, initH = rv.CaptureX, rv.CaptureY, rv.CaptureW, rv.CaptureH
		}
	}

	x, y, w, h, confirmed := capture.SelectRegion(aspectW, aspectH, initX, initY, initW, initH)
	if !confirmed {
		return nil
	}

	cfg := devices.RearViewConfig{CaptureX: x, CaptureY: y, CaptureW: w, CaptureH: h}
	cfgJSON, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("DeviceSelectCaptureRegion: marshal: %w", err)
	}
	if err := devices.SetPurposeConfig(reg, id, cfgJSON); err != nil {
		return fmt.Errorf("DeviceSelectCaptureRegion: %w", err)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceSelectCaptureRegion: save: %w", err)
	}
	// Hot-reload: restart the driver so the new MirrorRenderer picks up the new region.
	if updated := devices.FindByID(reg, id); updated != nil && updated.HasScreen() {
		a.coord.SetScreenConfig(id, *updated)
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

// DeviceSetDeviceDisabled disables or re-enables rendering for the given device.
// When disabled the USB handle is released so another app (e.g. SimHub) can
// drive the screen. Sprint reconnects when called with false.
func (a *App) DeviceSetDeviceDisabled(deviceID string, disabled bool) {
	a.coord.SetDeviceDisabled(deviceID, disabled)
}

// DeviceGetDeviceDisabled reports whether the given device's rendering is disabled.
func (a *App) DeviceGetDeviceDisabled(deviceID string) bool {
	return a.coord.GetDeviceDisabled(deviceID)
}

// scanAllUnregistered scans USB for all devices of the given driver type that
// are not already present in the registry.
func (a *App) scanAllUnregistered(reg *devices.DeviceRegistry, driver devices.DriverType) ([]devices.DetectedScreen, error) {
	switch driver {
	case devices.DriverVoCore:
		screens, err := hardware.ScanVoCore()
		if err != nil {
			return nil, fmt.Errorf("scan vocore: %w", err)
		}
		var result []devices.DetectedScreen
		for _, s := range screens {
			if devices.FindByID(reg, devices.DeviceID(s.VID, s.PID, s.Serial)) == nil {
				result = append(result, devices.DetectedScreen{
					VID: s.VID, PID: s.PID, Serial: s.Serial,
					Width: s.Width, Height: s.Height, Description: s.Description,
					Driver: devices.DriverVoCore,
				})
			}
		}
		return result, nil
	case devices.DriverUSBD480:
		screens, err := hardware.ScanUSBD480()
		if err != nil {
			return nil, fmt.Errorf("scan usbd480: %w", err)
		}
		var result []devices.DetectedScreen
		for _, s := range screens {
			if devices.FindByID(reg, devices.DeviceID(s.VID, s.PID, s.Serial)) == nil {
				result = append(result, devices.DetectedScreen{
					VID: s.VID, PID: s.PID, Serial: s.Serial,
					Width: s.Width, Height: s.Height, Description: s.Description,
					Driver: devices.DriverUSBD480,
				})
			}
		}
		return result, nil
	default:
		return nil, fmt.Errorf("unknown driver type %q", driver)
	}
}

// scanFirstUnregistered scans USB for the first device of the given driver type
// that is not already present in the registry.
func (a *App) scanFirstUnregistered(reg *devices.DeviceRegistry, driver devices.DriverType) (devices.DetectedScreen, error) {
	all, err := a.scanAllUnregistered(reg, driver)
	if err != nil {
		return devices.DetectedScreen{}, err
	}
	if len(all) == 0 {
		return devices.DetectedScreen{}, fmt.Errorf("no unregistered %s device found", driver)
	}
	return all[0], nil
}

// DeviceScanUnregistered scans USB for all unregistered devices matching the
// driver of the given generic catalog entry (VID=0, PID=0). Returns all
// candidates so the frontend can present a picker when multiple are found.
func (a *App) DeviceScanUnregistered(catalogID string) ([]devices.DetectedScreen, error) {
	entry, ok := devices.CatalogByID(catalogID)
	if !ok {
		return nil, fmt.Errorf("DeviceScanUnregistered: unknown catalog ID %q", catalogID)
	}
	if !entry.IsGeneric() {
		return nil, fmt.Errorf("DeviceScanUnregistered: catalog entry %q is not a generic entry", catalogID)
	}
	reg, err := a.devMgr.Load()
	if err != nil {
		return nil, fmt.Errorf("DeviceScanUnregistered: load registry: %w", err)
	}
	return a.scanAllUnregistered(reg, entry.Driver)
}

// DeviceAddScanned adds a specific device found by a prior scan to the registry.
// Intended for use after DeviceScanUnregistered when the user picks one of
// multiple detected screens. The device is re-validated by scanning to ensure
// it is still connected and to retrieve current dimensions.
func (a *App) DeviceAddScanned(catalogID string, vid, pid uint16, serial string) error {
	entry, ok := devices.CatalogByID(catalogID)
	if !ok {
		return fmt.Errorf("DeviceAddScanned: unknown catalog ID %q", catalogID)
	}

	reg, err := a.devMgr.Load()
	if err != nil {
		return fmt.Errorf("DeviceAddScanned: load registry: %w", err)
	}

	all, err := a.scanAllUnregistered(reg, entry.Driver)
	if err != nil {
		return fmt.Errorf("DeviceAddScanned: %w", err)
	}

	var detected *devices.DetectedScreen
	for i := range all {
		if all[i].VID == vid && all[i].PID == pid && all[i].Serial == serial {
			detected = &all[i]
			break
		}
	}
	if detected == nil {
		return fmt.Errorf("DeviceAddScanned: device %s not found among unregistered devices", devices.DeviceID(vid, pid, serial))
	}

	saved := entry.ToSavedDevice("")
	saved.VID = detected.VID
	saved.PID = detected.PID
	saved.Serial = detected.Serial
	saved.Width = detected.Width
	saved.Height = detected.Height
	if saved.Name == "" || saved.Name == entry.Name {
		saved.Name = detected.Description
	}
	if saved.Rotation == 0 && saved.Height > saved.Width {
		saved.Rotation = 90
	}

	id := devices.DeviceID(saved.VID, saved.PID, saved.Serial)
	existing := devices.FindByID(reg, id)
	if existing != nil {
		existing.Width = saved.Width
		existing.Height = saved.Height
	} else {
		reg.Devices = append(reg.Devices, saved)
	}
	if err := a.devMgr.Save(reg); err != nil {
		return fmt.Errorf("DeviceAddScanned: save: %w", err)
	}

	device := devices.FindByID(reg, id)
	if device != nil && device.HasScreen() {
		a.coord.SetScreenConfig(id, *device)
	}
	a.coord.ReloadInputBindings()
	return nil
}
