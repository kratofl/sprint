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

// DevicePurpose identifies the role of a screen-capable device.
// Empty string is treated as PurposeDash for backward compatibility.
type DevicePurpose string

const (
	PurposeDash     DevicePurpose = "dash"
	PurposeRearView DevicePurpose = "rear_view"
)

// DeviceType categorises a registered device by its capabilities.
type DeviceType string

const (
	DeviceTypeWheel     DeviceType = "wheel"     // screen + buttons; future: LEDs
	DeviceTypeScreen    DeviceType = "screen"    // display only
	DeviceTypeButtonBox DeviceType = "buttonbox" // buttons only; future: LEDs
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
	VID           uint16          `json:"vid"`
	PID           uint16          `json:"pid"`
	Serial        string          `json:"serial,omitempty"`
	Type          DeviceType      `json:"type,omitempty"` // defaults to DeviceTypeScreen for old entries
	Width         int             `json:"width"`
	Height        int             `json:"height"`
	Name          string          `json:"name"`
	Rotation      int             `json:"rotation"`             // 0=0°, 90=CW90, 180=180°, 270=CW270
	TargetFPS     int             `json:"target_fps,omitempty"` // 0 = use driver default
	OffsetX       int             `json:"offset_x,omitempty"`   // pixels from left in screen space
	OffsetY       int             `json:"offset_y,omitempty"`   // pixels from top in screen space
	Driver        DriverType      `json:"driver"`
	DashID        string          `json:"dash_id,omitempty"`        // assigned dash layout; empty = use default
	Purpose       DevicePurpose   `json:"purpose,omitempty"`        // defaults to PurposeDash
	PurposeConfig json.RawMessage `json:"purpose_config,omitempty"` // purpose-specific config JSON blob
	Bindings      []DeviceBinding `json:"bindings,omitempty"`
	Disabled      bool            `json:"disabled,omitempty"` // user-disabled; persisted across restarts
}

// HasScreen reports whether this device has a screen (wheel or screen type).
func (d *SavedDevice) HasScreen() bool {
	return d.Type == DeviceTypeWheel || d.Type == DeviceTypeScreen || d.Type == ""
}

// ScreenConfig is the hardware-agnostic config the coordinator uses to drive
// a screen-capable device. Only valid when HasScreen() is true.
type ScreenConfig struct {
	VID       uint16     `json:"vid"`
	PID       uint16     `json:"pid"`
	Width     int        `json:"width"`
	Height    int        `json:"height"`
	Rotation  int        `json:"rotation"`
	TargetFPS int        `json:"target_fps,omitempty"` // 0 = use driver default
	OffsetX   int        `json:"offset_x,omitempty"`   // pixels from left in screen space
	OffsetY   int        `json:"offset_y,omitempty"`   // pixels from top in screen space
	Driver    DriverType `json:"driver"`
}

// DeviceRegistry holds all known devices.
type DeviceRegistry struct {
	Devices []SavedDevice `json:"devices"`
}

// Manager handles persistence of the device registry under a data/devices/
// directory, with one JSON file per device type.
type Manager struct {
	dir string
}

// NewManager creates a Manager using the local app data directory.
func NewManager() *Manager {
	return &Manager{dir: filepath.Join(appdata.Dir(), "devices")}
}

func (m *Manager) filePath(name string) string {
	return filepath.Join(m.dir, name)
}

// readDeviceFile reads a flat JSON array of SavedDevice from path.
// Returns nil slice (no error) if the file does not exist.
func readDeviceFile(path string) ([]SavedDevice, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("devices: read %s: %w", filepath.Base(path), err)
	}
	var devices []SavedDevice
	if err := json.Unmarshal(data, &devices); err != nil {
		return nil, fmt.Errorf("devices: parse %s: %w", filepath.Base(path), err)
	}
	return devices, nil
}

// writeDeviceFile writes a flat JSON array of SavedDevice to path.
func writeDeviceFile(path string, devices []SavedDevice) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("devices: mkdir: %w", err)
	}
	data, err := json.MarshalIndent(devices, "", "  ")
	if err != nil {
		return fmt.Errorf("devices: marshal %s: %w", filepath.Base(path), err)
	}
	return os.WriteFile(path, data, 0644)
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

// Load reads the registry from disk. Each device type is stored in its own file
// under the devices/ directory. Returns an empty registry if no files exist.
func (m *Manager) Load() (*DeviceRegistry, error) {
	files := map[string]DeviceType{
		"wheels.json":      DeviceTypeWheel,
		"screens.json":     DeviceTypeScreen,
		"buttonboxes.json": DeviceTypeButtonBox,
	}
	var reg DeviceRegistry
	for file := range files {
		devices, err := readDeviceFile(m.filePath(file))
		if err != nil {
			return nil, err
		}
		reg.Devices = append(reg.Devices, devices...)
	}
	return &reg, nil
}

// Save writes the registry to disk, splitting devices into per-type files.
func (m *Manager) Save(reg *DeviceRegistry) error {
	buckets := map[string][]SavedDevice{
		"wheels.json":      nil,
		"screens.json":     nil,
		"buttonboxes.json": nil,
	}
	for _, d := range reg.Devices {
		switch d.Type {
		case DeviceTypeWheel:
			buckets["wheels.json"] = append(buckets["wheels.json"], d)
		case DeviceTypeButtonBox:
			buckets["buttonboxes.json"] = append(buckets["buttonboxes.json"], d)
		default: // DeviceTypeScreen or legacy ""
			buckets["screens.json"] = append(buckets["screens.json"], d)
		}
	}
	for file, devices := range buckets {
		if devices == nil {
			devices = []SavedDevice{}
		}
		if err := writeDeviceFile(m.filePath(file), devices); err != nil {
			return err
		}
	}
	return nil
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
	targetFPS := 30
	if screen.Driver == DriverUSBD480 {
		targetFPS = 60
	}
	reg.Devices = append(reg.Devices, SavedDevice{
		VID:       screen.VID,
		PID:       screen.PID,
		Serial:    screen.Serial,
		Type:      DeviceTypeScreen,
		Width:     screen.Width,
		Height:    screen.Height,
		Name:      name,
		Rotation:  rotation,
		TargetFPS: targetFPS,
		Driver:    screen.Driver,
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

// SetDisabled updates the disabled flag for the device with the given composite ID.
func SetDisabled(reg *DeviceRegistry, id string, disabled bool) error {
	for i := range reg.Devices {
		if DeviceID(reg.Devices[i].VID, reg.Devices[i].PID, reg.Devices[i].Serial) == id {
			reg.Devices[i].Disabled = disabled
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
		VID:       d.VID,
		PID:       d.PID,
		Width:     d.Width,
		Height:    d.Height,
		Rotation:  d.Rotation,
		TargetFPS: d.TargetFPS,
		OffsetX:   d.OffsetX,
		OffsetY:   d.OffsetY,
		Driver:    d.Driver,
	}
}

// SetScreenOffset updates the screen offset for the device with the given composite ID.
func SetScreenOffset(reg *DeviceRegistry, id string, offsetX, offsetY int) error {
	for i := range reg.Devices {
		if DeviceID(reg.Devices[i].VID, reg.Devices[i].PID, reg.Devices[i].Serial) == id {
			reg.Devices[i].OffsetX = offsetX
			reg.Devices[i].OffsetY = offsetY
			return nil
		}
	}
	return fmt.Errorf("devices: device %q not found", id)
}

// SetPurpose updates the purpose for the device with the given composite ID.
func SetPurpose(reg *DeviceRegistry, id string, purpose DevicePurpose) error {
	for i := range reg.Devices {
		if DeviceID(reg.Devices[i].VID, reg.Devices[i].PID, reg.Devices[i].Serial) == id {
			reg.Devices[i].Purpose = purpose
			return nil
		}
	}
	return fmt.Errorf("devices: device %q not found", id)
}

// SetPurposeConfig updates the purpose-specific config blob for the device with
// the given composite ID. config must be valid JSON or nil.
func SetPurposeConfig(reg *DeviceRegistry, id string, config json.RawMessage) error {
	for i := range reg.Devices {
		if DeviceID(reg.Devices[i].VID, reg.Devices[i].PID, reg.Devices[i].Serial) == id {
			reg.Devices[i].PurposeConfig = config
			return nil
		}
	}
	return fmt.Errorf("devices: device %q not found", id)
}

// RearViewConfig is the purpose-specific configuration for PurposeRearView devices.
// Stored as JSON in SavedDevice.PurposeConfig.
type RearViewConfig struct {
	CaptureX int    `json:"capture_x"` // left edge of capture region in game window coords
	CaptureY int    `json:"capture_y"` // top edge of capture region
	CaptureW int    `json:"capture_w"` // width; 0 = full window width
	CaptureH int    `json:"capture_h"` // height; 0 = full window height
	IdleMode string `json:"idle_mode"` // what to show when no game is running; "" or "black" = black frame, "clock" = digital clock
}

const (
	RearViewIdleBlack = "black"
	RearViewIdleClock = "clock"
)
