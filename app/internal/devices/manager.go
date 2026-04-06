// Package devices manages the registry of known devices (wheels, screens, button boxes).
// It is hardware-agnostic: USB scanning and driver logic live in the hardware
// package; this package owns persistence and user-metadata (name, rotation,
// driver type) that survive physical disconnection.
package devices

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/kratofl/sprint/app/internal/appdata"
)

// DeviceType categorises a registered device by its capabilities.
type DeviceType string

const (
	DeviceTypeWheel     DeviceType = "wheel"      // screen + buttons; future: LEDs
	DeviceTypeScreen    DeviceType = "screen"      // display only
	DeviceTypeButtonBox DeviceType = "buttonbox"   // buttons only; future: LEDs
)

// DriverType identifies which hardware driver backs a screen-capable device.
type DriverType = string

const (
	DriverVoCore  DriverType = "vocore"
	DriverUSBD480 DriverType = "usbd480"
)

// DetectedScreen is a hardware-agnostic description of a screen found by USB scan.
// Callers in the hardware layer convert their scan results into this type before
// passing them to Upsert.
type DetectedScreen struct {
	VID         uint16     `json:"vid"`
	PID         uint16     `json:"pid"`
	Serial      string     `json:"serial,omitempty"`
	Width       int        `json:"width"`
	Height      int        `json:"height"`
	Description string     `json:"description"`
	Driver      DriverType `json:"driver"`
}

// DeviceBinding maps a hardware button channel to an application command for a
// specific device. Stored alongside the device configuration so each device
// can have its own physical button assignments.
type DeviceBinding struct {
	Button  int    `json:"button"`
	Command string `json:"command"`
}

// SavedDevice is a persisted registry entry with user metadata that survives
// disconnection. Replaces the former SavedScreen type.
type SavedDevice struct {
	VID      uint16          `json:"vid"`
	PID      uint16          `json:"pid"`
	Serial   string          `json:"serial,omitempty"`
	Type     DeviceType      `json:"type,omitempty"`     // defaults to DeviceTypeScreen for old entries
	Width    int             `json:"width"`
	Height   int             `json:"height"`
	Name     string          `json:"name"`
	Rotation int             `json:"rotation"` // 0=0°, 90=CW90, 180=180°, 270=CW270
	Driver   DriverType      `json:"driver"`
	DashID   string          `json:"dash_id,omitempty"`   // assigned dash layout; empty = use default
	Bindings []DeviceBinding `json:"bindings,omitempty"`
}

// HasScreen reports whether this device has a screen (wheel or screen type).
func (d *SavedDevice) HasScreen() bool {
	return d.Type == DeviceTypeWheel || d.Type == DeviceTypeScreen || d.Type == ""
}

// ScreenConfig is the hardware-agnostic config the coordinator uses to drive
// a screen-capable device. Only valid when HasScreen() is true.
type ScreenConfig struct {
	VID      uint16     `json:"vid"`
	PID      uint16     `json:"pid"`
	Width    int        `json:"width"`
	Height   int        `json:"height"`
	Rotation int        `json:"rotation"`
	Driver   DriverType `json:"driver"`
}

// DeviceRegistry holds all known devices.
type DeviceRegistry struct {
	Devices []SavedDevice `json:"devices"`
}

// Manager handles persistence of the device registry at data/screens.json
// (next to the executable, or OS config dir as fallback).
type Manager struct {
	path    string
	oldPath string // legacy screen.json migration source
}

// NewManager creates a Manager using the local app data directory.
func NewManager() *Manager {
	base := appdata.Dir()
	return &Manager{
		path:    filepath.Join(base, "screens.json"),
		oldPath: filepath.Join(base, "screen.json"),
	}
}

// DeviceID returns the composite key "vid-pid[-serial]" for a device.
func DeviceID(vid, pid uint16, serial string) string {
	if serial == "" {
		return fmt.Sprintf("%04x-%04x", vid, pid)
	}
	return fmt.Sprintf("%04x-%04x-%s", vid, pid, serial)
}

// ScreenID is an alias for DeviceID kept for call-site compatibility.
// Deprecated: use DeviceID.
func ScreenID(vid, pid uint16, serial string) string {
	return DeviceID(vid, pid, serial)
}

// Load reads the registry from disk. Migrates a legacy VoCore screen.json on
// first run. Returns an empty registry (no error) if neither file exists.
func (m *Manager) Load() (*DeviceRegistry, error) {
	data, err := os.ReadFile(m.path)
	if err != nil {
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("devices: read registry: %w", err)
		}
		return m.migrate()
	}
	var reg DeviceRegistry
	if err := json.Unmarshal(data, &reg); err != nil {
		return nil, fmt.Errorf("devices: parse registry: %w", err)
	}
	return &reg, nil
}

// Save writes the registry to disk, creating parent directories if needed.
func (m *Manager) Save(reg *DeviceRegistry) error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0755); err != nil {
		return fmt.Errorf("devices: mkdir: %w", err)
	}
	data, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return fmt.Errorf("devices: marshal registry: %w", err)
	}
	return os.WriteFile(m.path, data, 0644)
}

// Upsert adds a detected screen to the registry as a SavedDevice if not already
// present (keyed by VID+PID+Serial), or refreshes its dimensions while preserving
// user-set Name and Rotation. Smart-defaults rotation to 90° CW for portrait-native
// screens (height > width) on first insert.
func Upsert(reg *DeviceRegistry, screen DetectedScreen) {
	id := DeviceID(screen.VID, screen.PID, screen.Serial)
	for i := range reg.Devices {
		if DeviceID(reg.Devices[i].VID, reg.Devices[i].PID, reg.Devices[i].Serial) == id {
			reg.Devices[i].Width = screen.Width
			reg.Devices[i].Height = screen.Height
			return
		}
	}
	name := screen.Description
	if name == "" {
		name = fmt.Sprintf("Screen · %d×%d", screen.Width, screen.Height)
	}
	rotation := 0
	if screen.Height > screen.Width {
		rotation = 90
	}
	reg.Devices = append(reg.Devices, SavedDevice{
		VID:      screen.VID,
		PID:      screen.PID,
		Serial:   screen.Serial,
		Type:     DeviceTypeScreen,
		Width:    screen.Width,
		Height:   screen.Height,
		Name:     name,
		Rotation: rotation,
		Driver:   screen.Driver,
	})
}

// Rename updates the user-defined name for the device with the given composite ID.
func Rename(reg *DeviceRegistry, id, name string) error {
	for i := range reg.Devices {
		if DeviceID(reg.Devices[i].VID, reg.Devices[i].PID, reg.Devices[i].Serial) == id {
			reg.Devices[i].Name = name
			return nil
		}
	}
	return fmt.Errorf("devices: device %q not found", id)
}

// SetRotation updates the rotation for the device with the given ID.
// Valid values: 0, 90, 180, 270.
func SetRotation(reg *DeviceRegistry, id string, rotation int) error {
	for i := range reg.Devices {
		if DeviceID(reg.Devices[i].VID, reg.Devices[i].PID, reg.Devices[i].Serial) == id {
			reg.Devices[i].Rotation = rotation
			return nil
		}
	}
	return fmt.Errorf("devices: device %q not found", id)
}

// SetDashLayout assigns a dash layout ID to the device with the given composite ID.
func SetDashLayout(reg *DeviceRegistry, id, dashID string) error {
	for i := range reg.Devices {
		if DeviceID(reg.Devices[i].VID, reg.Devices[i].PID, reg.Devices[i].Serial) == id {
			reg.Devices[i].DashID = dashID
			return nil
		}
	}
	return fmt.Errorf("devices: device %q not found", id)
}

// SetDeviceBindings updates the button→command bindings for the device with
// the given composite ID.
func SetDeviceBindings(reg *DeviceRegistry, id string, bindings []DeviceBinding) error {
	for i := range reg.Devices {
		if DeviceID(reg.Devices[i].VID, reg.Devices[i].PID, reg.Devices[i].Serial) == id {
			reg.Devices[i].Bindings = bindings
			return nil
		}
	}
	return fmt.Errorf("devices: device %q not found", id)
}

// FindByID returns the SavedDevice with the given composite ID, or nil.
func FindByID(reg *DeviceRegistry, id string) *SavedDevice {
	for i := range reg.Devices {
		if DeviceID(reg.Devices[i].VID, reg.Devices[i].PID, reg.Devices[i].Serial) == id {
			return &reg.Devices[i]
		}
	}
	return nil
}

// Remove removes the device with the given composite ID from the registry.
// Returns nil if the device is not found.
func Remove(reg *DeviceRegistry, id string) {
	for i, d := range reg.Devices {
		if DeviceID(d.VID, d.PID, d.Serial) == id {
			reg.Devices = append(reg.Devices[:i], reg.Devices[i+1:]...)
			return
		}
	}
}

// ToScreenConfig converts a SavedDevice to a ScreenConfig for the coordinator.
// Only meaningful when d.HasScreen() is true.
func ToScreenConfig(d *SavedDevice) ScreenConfig {
	return ScreenConfig{
		VID:      d.VID,
		PID:      d.PID,
		Width:    d.Width,
		Height:   d.Height,
		Rotation: d.Rotation,
		Driver:   d.Driver,
	}
}

// migrate reads a legacy screen.json (VoCore-only, pre-registry format) and
// synthesises a DeviceRegistry from it.
func (m *Manager) migrate() (*DeviceRegistry, error) {
	reg := &DeviceRegistry{}
	data, err := os.ReadFile(m.oldPath)
	if err != nil {
		if os.IsNotExist(err) {
			return reg, nil
		}
		return nil, fmt.Errorf("devices: read legacy screen config: %w", err)
	}
	var legacy struct {
		VID    uint16 `json:"vid"`
		PID    uint16 `json:"pid"`
		Width  int    `json:"width"`
		Height int    `json:"height"`
	}
	if err := json.Unmarshal(data, &legacy); err != nil || legacy.VID == 0 {
		return reg, nil
	}
	w, h := legacy.Width, legacy.Height
	if h > w {
		w, h = h, w
	}
	detected := DetectedScreen{
		VID:         legacy.VID,
		PID:         legacy.PID,
		Width:       w,
		Height:      h,
		Description: fmt.Sprintf("VoCore Screen · %d×%d", w, h),
		Driver:      DriverVoCore,
	}
	Upsert(reg, detected)
	return reg, nil
}
