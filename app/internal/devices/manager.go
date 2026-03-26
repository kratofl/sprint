package devices

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/google/uuid"
	"go.bug.st/serial/enumerator"
)

// DeviceConfig is a user-configured steering wheel screen.
// Stored in ~/.config/Sprint/devices.json as a JSON array.
type DeviceConfig struct {
	// ID is a UUID assigned on first save.
	ID string `json:"id"`
	// ModelID references a WheelModel.ID from the registry.
	ModelID string `json:"modelId"`
	// Alias is an optional user-defined nickname. Falls back to the model name.
	Alias string `json:"alias,omitempty"`
	// Port is the LED controller's serial port path (e.g. "/dev/cu.usbmodem133101",
	// "COM3"). Used to identify which physical wheel is connected when multiple
	// wheels share the same model. This is NOT the VoCore screen device — the
	// screen is identified by its ScreenVID/ScreenPID in the model registry and
	// communicates via USB bulk transfer, not serial.
	Port string `json:"port"`
}

// DisplayName returns the alias if set, otherwise the model name.
func (d *DeviceConfig) DisplayName(models []WheelModel) string {
	if d.Alias != "" {
		return d.Alias
	}
	if m := FindModel(d.ModelID); m != nil {
		return m.Manufacturer + " " + m.Name
	}
	return d.ModelID
}

// DetectedPort is a serial port found during enumeration, optionally matched
// to a known wheel model by its USB VID/PID.
type DetectedPort struct {
	// Name is the OS device path, e.g. "/dev/cu.usbmodem133101" or "COM3".
	Name string `json:"name"`
	// IsUSB is true when the port is USB-attached.
	IsUSB bool `json:"isUsb"`
	// MatchedModel is non-nil when the port's VID/PID matches a known model.
	MatchedModel *WheelModel `json:"matchedModel,omitempty"`
	// Description is a human-friendly label: the matched model name, the
	// USB product string, or just the port name.
	Description string `json:"description"`
}

// Manager persists and retrieves the list of configured devices.
// All public methods are safe for concurrent use.
type Manager struct {
	mu      sync.Mutex
	devices []DeviceConfig
	path    string
}

// NewManager creates a Manager that stores devices at the standard config path.
func NewManager() *Manager {
	dir, _ := os.UserConfigDir()
	m := &Manager{path: filepath.Join(dir, "Sprint", "devices.json")}
	_ = m.load() // ignore error — file may not exist yet
	return m
}

// GetAll returns all configured devices.
func (m *Manager) GetAll() []DeviceConfig {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.devices == nil {
		return []DeviceConfig{}
	}
	out := make([]DeviceConfig, len(m.devices))
	copy(out, m.devices)
	return out
}

// GetActive returns the first configured device, or nil if none are configured.
// When multiple devices are present the first one in the list is the active one.
func (m *Manager) GetActive() *DeviceConfig {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.devices) == 0 {
		return nil
	}
	d := m.devices[0]
	return &d
}

// Save adds or updates a device. If d.ID is empty a new UUID is assigned.
// The updated device is returned.
func (m *Manager) Save(d DeviceConfig) (DeviceConfig, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if d.ID == "" {
		d.ID = uuid.NewString()
	}
	if d.ModelID == "" {
		return DeviceConfig{}, fmt.Errorf("devices: modelId is required")
	}
	if d.Port == "" {
		return DeviceConfig{}, fmt.Errorf("devices: port is required")
	}

	updated := false
	for i, existing := range m.devices {
		if existing.ID == d.ID {
			m.devices[i] = d
			updated = true
			break
		}
	}
	if !updated {
		m.devices = append(m.devices, d)
	}

	return d, m.persist()
}

// Delete removes a device by ID.
func (m *Manager) Delete(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := len(m.devices)
	filtered := m.devices[:0]
	for _, d := range m.devices {
		if d.ID != id {
			filtered = append(filtered, d)
		}
	}
	if len(filtered) == n {
		return fmt.Errorf("devices: device %q not found", id)
	}
	m.devices = filtered
	return m.persist()
}

// ListPorts enumerates all serial ports and annotates them with matched wheel
// models. Matched ports (VID/PID in registry) are returned first.
func ListPorts() ([]DetectedPort, error) {
	raw, err := enumerator.GetDetailedPortsList()
	if err != nil {
		return nil, fmt.Errorf("devices: list ports: %w", err)
	}

	var matched, unmatched []DetectedPort
	for _, p := range raw {
		dp := DetectedPort{
			Name:  p.Name,
			IsUSB: p.IsUSB,
		}
		if p.IsUSB {
			vid := parseHex(p.VID)
			pid := parseHex(p.PID)
			if model := MatchPort(vid, pid); model != nil {
				dp.MatchedModel = model
				dp.Description = model.Manufacturer + " " + model.Name
				matched = append(matched, dp)
				continue
			}
			if p.Product != "" {
				dp.Description = p.Product
			} else {
				dp.Description = p.Name
			}
		} else {
			dp.Description = p.Name
		}
		unmatched = append(unmatched, dp)
	}

	return append(matched, unmatched...), nil
}

// ── internal ─────────────────────────────────────────────────────────────────

func (m *Manager) load() error {
	data, err := os.ReadFile(m.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("devices: read %s: %w", m.path, err)
	}
	return json.Unmarshal(data, &m.devices)
}

func (m *Manager) persist() error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0755); err != nil {
		return fmt.Errorf("devices: mkdir: %w", err)
	}
	data, err := json.MarshalIndent(m.devices, "", "  ")
	if err != nil {
		return fmt.Errorf("devices: marshal: %w", err)
	}
	return os.WriteFile(m.path, data, 0644)
}

// parseHex parses a VID/PID hex string (e.g. "16D0") returned by the enumerator
// into a uint16. Returns 0 on any parse error.
func parseHex(s string) uint16 {
	var v uint16
	fmt.Sscanf(s, "%X", &v)
	return v
}
