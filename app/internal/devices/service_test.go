package devices

import (
	"encoding/json"
	"reflect"
	"testing"
)

type fakeRuntime struct {
	screenConfigs []string
	removed       []string
	reloads       int
	disabled      []struct {
		id       string
		disabled bool
	}
}

func (f *fakeRuntime) SetScreenConfig(deviceID string, _ SavedDevice) {
	f.screenConfigs = append(f.screenConfigs, deviceID)
}

func (f *fakeRuntime) RemoveDevice(deviceID string) {
	f.removed = append(f.removed, deviceID)
}

func (f *fakeRuntime) ReloadInputBindings() {
	f.reloads++
}

func (f *fakeRuntime) SetDeviceDisabled(deviceID string, disabled bool) {
	f.disabled = append(f.disabled, struct {
		id       string
		disabled bool
	}{id: deviceID, disabled: disabled})
}

func (f *fakeRuntime) GetDeviceDisabled(_ string) bool {
	return false
}

func seedRegistry(t *testing.T, manager *Manager) string {
	t.Helper()

	reg := &DeviceRegistry{
		Devices: []SavedDevice{{
			VID:    0x1234,
			PID:    0x5678,
			Serial: "screen-a",
			Type:   DeviceTypeScreen,
			Width:  800,
			Height: 480,
			Name:   "Dash screen",
			Driver: DriverVoCore,
		}},
	}

	if err := manager.Save(reg); err != nil {
		t.Fatalf("seed registry: %v", err)
	}

	return DeviceID(0x1234, 0x5678, "screen-a")
}

func TestServiceSetPurposeConfigSavesAndReloadsScreenDevices(t *testing.T) {
	manager := &Manager{dir: t.TempDir()}
	runtime := &fakeRuntime{}
	deviceID := seedRegistry(t, manager)
	service := NewService(manager, runtime, nil)

	config := json.RawMessage(`{"capture_x":12,"capture_y":16,"capture_w":320,"capture_h":90}`)
	if err := service.SetPurposeConfig(deviceID, config); err != nil {
		t.Fatalf("SetPurposeConfig: %v", err)
	}

	reg, err := manager.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	device := FindByID(reg, deviceID)
	if device == nil {
		t.Fatal("device missing after update")
	}
	var saved map[string]any
	var expected map[string]any
	if err := json.Unmarshal(device.PurposeConfig, &saved); err != nil {
		t.Fatalf("unmarshal saved config: %v", err)
	}
	if err := json.Unmarshal(config, &expected); err != nil {
		t.Fatalf("unmarshal expected config: %v", err)
	}
	if !reflect.DeepEqual(saved, expected) {
		t.Fatalf("purpose config mismatch: got %#v want %#v", saved, expected)
	}
	if len(runtime.screenConfigs) != 1 || runtime.screenConfigs[0] != deviceID {
		t.Fatalf("expected screen config reload for %s, got %#v", deviceID, runtime.screenConfigs)
	}
}

func TestServiceSaveDeviceBindingsPersistsBindingsAndReloadsInput(t *testing.T) {
	manager := &Manager{dir: t.TempDir()}
	runtime := &fakeRuntime{}
	deviceID := seedRegistry(t, manager)
	service := NewService(manager, runtime, nil)

	bindings := []DeviceBinding{
		{Button: 2, Command: "dash.page.next"},
		{Button: 3, Command: "dash.page.prev"},
	}
	if err := service.SaveDeviceBindings(deviceID, bindings); err != nil {
		t.Fatalf("SaveDeviceBindings: %v", err)
	}

	reg, err := manager.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	device := FindByID(reg, deviceID)
	if device == nil {
		t.Fatal("device missing after bindings update")
	}
	if len(device.Bindings) != 2 {
		t.Fatalf("expected 2 bindings, got %d", len(device.Bindings))
	}
	if runtime.reloads != 1 {
		t.Fatalf("expected one input binding reload, got %d", runtime.reloads)
	}
}
