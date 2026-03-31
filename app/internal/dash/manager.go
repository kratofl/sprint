package dash

import (
	"encoding/json"
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
)

//go:embed default.json
var defaultLayoutJSON []byte

// Manager handles persistence of the active DashLayout.
// The single active layout is stored at ~/.config/Sprint/layout.json.
type Manager struct {
	path string
}

// NewManager creates a Manager using the standard config directory.
func NewManager() *Manager {
	dir, _ := os.UserConfigDir()
	return &Manager{path: filepath.Join(dir, "Sprint", "layout.json")}
}

// Save writes the layout to disk, creating parent directories if needed.
func (m *Manager) Save(layout *DashLayout) error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0755); err != nil {
		return fmt.Errorf("dash: mkdir: %w", err)
	}
	data, err := json.MarshalIndent(layout, "", "  ")
	if err != nil {
		return fmt.Errorf("dash: marshal layout: %w", err)
	}
	return os.WriteFile(m.path, data, 0644)
}

// Load reads the saved layout from disk.
// If no layout has been saved yet, the embedded default layout is returned so
// the caller always receives a valid, ready-to-use layout.
func (m *Manager) Load() (*DashLayout, error) {
	data, err := os.ReadFile(m.path)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultLayout()
		}
		return nil, fmt.Errorf("dash: read layout: %w", err)
	}
	var layout DashLayout
	if err := json.Unmarshal(data, &layout); err != nil {
		return nil, fmt.Errorf("dash: parse layout: %w", err)
	}
	return &layout, nil
}

// defaultLayout unmarshals and returns the embedded default layout.
func defaultLayout() (*DashLayout, error) {
	var layout DashLayout
	if err := json.Unmarshal(defaultLayoutJSON, &layout); err != nil {
		return nil, fmt.Errorf("dash: parse embedded default layout: %w", err)
	}
	return &layout, nil
}

