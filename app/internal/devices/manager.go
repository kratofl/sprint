// Package devices manages the registry of known display screens.
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

// DriverType identifies which hardware driver backs a screen.
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

// SavedScreen is a persisted entry with user metadata that survives disconnection.
type SavedScreen struct {
	VID      uint16     `json:"vid"`
	PID      uint16     `json:"pid"`
	Serial   string     `json:"serial,omitempty"`
	Width    int        `json:"width"`
	Height   int        `json:"height"`
	Name     string     `json:"name"`
	Rotation int        `json:"rotation"` // 0=0°, 90=CW90, 180=180°, 270=CW270
	Driver   DriverType `json:"driver"`
	DashID   string     `json:"dash_id,omitempty"` // assigned dash layout ID; empty = use default
}

// ScreenConfig is the hardware-agnostic config the coordinator uses to activate
// a screen. The Driver field tells the coordinator which hardware driver to use.
type ScreenConfig struct {
	VID      uint16     `json:"vid"`
	PID      uint16     `json:"pid"`
	Width    int        `json:"width"`
	Height   int        `json:"height"`
	Rotation int        `json:"rotation"`
	Driver   DriverType `json:"driver"`
}

// ScreenRegistry holds all known screens and the composite ID of the active one.
type ScreenRegistry struct {
	Screens  []SavedScreen `json:"screens"`
	ActiveID string        `json:"active_id"`
}

// Manager handles persistence of the screen registry at %LOCALAPPDATA%\Sprint\screens.json
// (Windows) or the OS-equivalent local data directory.
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

// ScreenID returns the composite key "vid-pid[-serial]" for a screen.
func ScreenID(vid, pid uint16, serial string) string {
	if serial == "" {
		return fmt.Sprintf("%04x-%04x", vid, pid)
	}
	return fmt.Sprintf("%04x-%04x-%s", vid, pid, serial)
}

// Load reads the registry from disk. Migrates a legacy VoCore screen.json on
// first run. Returns an empty registry (no error) if neither file exists.
func (m *Manager) Load() (*ScreenRegistry, error) {
	data, err := os.ReadFile(m.path)
	if err != nil {
		if !os.IsNotExist(err) {
			return nil, fmt.Errorf("devices: read registry: %w", err)
		}
		return m.migrate()
	}
	var reg ScreenRegistry
	if err := json.Unmarshal(data, &reg); err != nil {
		return nil, fmt.Errorf("devices: parse registry: %w", err)
	}
	return &reg, nil
}

// Save writes the registry to disk, creating parent directories if needed.
func (m *Manager) Save(reg *ScreenRegistry) error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0755); err != nil {
		return fmt.Errorf("devices: mkdir: %w", err)
	}
	data, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return fmt.Errorf("devices: marshal registry: %w", err)
	}
	return os.WriteFile(m.path, data, 0644)
}

// Upsert adds a screen to the registry if not already present (keyed by
// VID+PID+Serial), or refreshes its dimensions while preserving the user-set
// Name and Rotation. Smart-defaults rotation to 90° CW for portrait-native
// screens (height > width) on first insert.
func Upsert(reg *ScreenRegistry, screen DetectedScreen) {
	id := ScreenID(screen.VID, screen.PID, screen.Serial)
	for i := range reg.Screens {
		if ScreenID(reg.Screens[i].VID, reg.Screens[i].PID, reg.Screens[i].Serial) == id {
			reg.Screens[i].Width = screen.Width
			reg.Screens[i].Height = screen.Height
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
	reg.Screens = append(reg.Screens, SavedScreen{
		VID:      screen.VID,
		PID:      screen.PID,
		Serial:   screen.Serial,
		Width:    screen.Width,
		Height:   screen.Height,
		Name:     name,
		Rotation: rotation,
		Driver:   screen.Driver,
	})
}

// Rename updates the user-defined name for the screen with the given composite ID.
func Rename(reg *ScreenRegistry, id, name string) error {
	for i := range reg.Screens {
		if ScreenID(reg.Screens[i].VID, reg.Screens[i].PID, reg.Screens[i].Serial) == id {
			reg.Screens[i].Name = name
			return nil
		}
	}
	return fmt.Errorf("devices: screen %q not found", id)
}

// SetRotation updates the rotation for the screen with the given ID.
// Valid values: 0, 90, 180, 270.
func SetRotation(reg *ScreenRegistry, id string, rotation int) error {
	for i := range reg.Screens {
		if ScreenID(reg.Screens[i].VID, reg.Screens[i].PID, reg.Screens[i].Serial) == id {
			reg.Screens[i].Rotation = rotation
			return nil
		}
	}
	return fmt.Errorf("devices: screen %q not found", id)
}

// SetDashLayout assigns a dash layout ID to the screen with the given composite ID.
func SetDashLayout(reg *ScreenRegistry, id, dashID string) error {
	for i := range reg.Screens {
		if ScreenID(reg.Screens[i].VID, reg.Screens[i].PID, reg.Screens[i].Serial) == id {
			reg.Screens[i].DashID = dashID
			return nil
		}
	}
	return fmt.Errorf("devices: screen %q not found", id)
}

// FindByID returns the SavedScreen with the given composite ID, or nil.
func FindByID(reg *ScreenRegistry, id string) *SavedScreen {
	for i := range reg.Screens {
		if ScreenID(reg.Screens[i].VID, reg.Screens[i].PID, reg.Screens[i].Serial) == id {
			return &reg.Screens[i]
		}
	}
	return nil
}

// ActiveScreen returns the currently active SavedScreen, or nil if none is set.
func ActiveScreen(reg *ScreenRegistry) *SavedScreen {
	if reg.ActiveID == "" {
		return nil
	}
	return FindByID(reg, reg.ActiveID)
}

// ToScreenConfig converts a SavedScreen to a ScreenConfig for the coordinator.
func ToScreenConfig(s *SavedScreen) ScreenConfig {
	return ScreenConfig{
		VID:      s.VID,
		PID:      s.PID,
		Width:    s.Width,
		Height:   s.Height,
		Rotation: s.Rotation,
		Driver:   s.Driver,
	}
}

// migrate reads a legacy screen.json (VoCore-only, pre-registry format) and
// synthesises a ScreenRegistry from it. Uses landscape-correct dimensions via
// the hardware PID table rather than raw legacy values, which may have been
// stored in portrait orientation by older code.
func (m *Manager) migrate() (*ScreenRegistry, error) {
	reg := &ScreenRegistry{}
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
	// Always present as landscape (swap if portrait-stored) so that the
	// smart-default rotation (height > width → 90°) does not fire incorrectly
	// for screens whose old config stored portrait dimensions.
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
	reg.ActiveID = ScreenID(legacy.VID, legacy.PID, "")
	return reg, nil
}

