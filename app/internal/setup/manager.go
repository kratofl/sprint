// Package setup manages car setup files: loading, saving, and organising
// setups by car and track for the local Wails app.
package setup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Setup represents a saved car setup.
type Setup struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Car      string         `json:"car"`
	Track    string         `json:"track"`
	Settings map[string]any `json:"settings"`
}

// Manager handles reading and writing setup files from the user's local data directory.
type Manager struct {
	dir string // root directory for setup files
}

// NewManager creates a Manager that stores setups in the OS user data directory.
func NewManager() *Manager {
	dir, _ := os.UserConfigDir()
	return &Manager{dir: filepath.Join(dir, "Sprint", "setups")}
}

// Save writes a setup to disk, creating directories as needed.
func (m *Manager) Save(s *Setup) error {
	if err := os.MkdirAll(m.setupDir(s.Car, s.Track), 0755); err != nil {
		return fmt.Errorf("setup: mkdir: %w", err)
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("setup: marshal: %w", err)
	}
	return os.WriteFile(m.setupPath(s.Car, s.Track, s.ID), data, 0644)
}

// Load reads a setup by car, track, and ID.
func (m *Manager) Load(car, track, id string) (*Setup, error) {
	data, err := os.ReadFile(m.setupPath(car, track, id))
	if err != nil {
		return nil, fmt.Errorf("setup: read: %w", err)
	}
	var s Setup
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("setup: unmarshal: %w", err)
	}
	return &s, nil
}

// List returns all setups for a given car and track.
func (m *Manager) List(car, track string) ([]*Setup, error) {
	pattern := filepath.Join(m.setupDir(car, track), "*.json")
	paths, err := filepath.Glob(pattern)
	if err != nil {
		return nil, err
	}
	setups := make([]*Setup, 0, len(paths))
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		var s Setup
		if err := json.Unmarshal(data, &s); err != nil {
			continue
		}
		setups = append(setups, &s)
	}
	return setups, nil
}

func (m *Manager) setupDir(car, track string) string {
	return filepath.Join(m.dir, sanitise(car), sanitise(track))
}

func (m *Manager) setupPath(car, track, id string) string {
	return filepath.Join(m.setupDir(car, track), sanitise(id)+".json")
}

// sanitise removes characters that are unsafe in file/directory names.
func sanitise(s string) string {
	safe := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c == '/' || c == '\\' || c == ':' || c == '*' || c == '?' || c == '"' || c == '<' || c == '>' || c == '|' {
			safe = append(safe, '_')
		} else {
			safe = append(safe, c)
		}
	}
	return string(safe)
}
