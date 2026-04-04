package dashboard

import (
	"encoding/json"
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/kratofl/sprint/app/internal/appdata"
)

//go:embed default.json
var defaultLayoutJSON []byte

// LayoutMeta is a lightweight descriptor returned by List (no widget data).
type LayoutMeta struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Manager handles persistence of named DashLayouts.
// Each layout is stored as data/layouts/<id>.json.
// Legacy data/layout.json is migrated on first List/Load call.
type Manager struct {
	dir     string
	oldPath string // legacy single-file migration source
}

// NewManager creates a Manager using the standard config directory.
func NewManager() *Manager {
	base := appdata.Dir()
	return &Manager{
		dir:     filepath.Join(base, "layouts"),
		oldPath: filepath.Join(base, "layout.json"),
	}
}

// List returns metadata for all stored layouts, alphabetically by name.
// Migrates a legacy layout.json on first call if no layouts directory exists.
func (m *Manager) List() ([]LayoutMeta, error) {
	if err := m.migrate(); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return nil, fmt.Errorf("dash: list layouts: %w", err)
	}
	var metas []LayoutMeta
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		layout, err := m.Load(id)
		if err != nil {
			continue // skip corrupt files
		}
		metas = append(metas, LayoutMeta{ID: layout.ID, Name: layout.Name})
	}
	return metas, nil
}

// Load reads a layout by ID from disk.
// If id is empty, the first available layout (or embedded default) is returned.
func (m *Manager) Load(id string) (*DashLayout, error) {
	if err := m.migrate(); err != nil {
		return nil, err
	}
	if id == "" {
		return m.loadFirst()
	}
	data, err := os.ReadFile(m.filePath(id))
	if err != nil {
		if os.IsNotExist(err) {
			return m.loadFirst()
		}
		return nil, fmt.Errorf("dash: read layout %q: %w", id, err)
	}
	var layout DashLayout
	if err := json.Unmarshal(data, &layout); err != nil {
		return nil, fmt.Errorf("dash: parse layout %q: %w", id, err)
	}
	return &layout, nil
}

// Save writes a layout to disk. A new UUID is assigned if layout.ID is empty.
func (m *Manager) Save(layout *DashLayout) error {
	if err := os.MkdirAll(m.dir, 0755); err != nil {
		return fmt.Errorf("dash: mkdir: %w", err)
	}
	if layout.ID == "" {
		layout.ID = uuid.NewString()
	}
	if layout.Name == "" {
		layout.Name = "Untitled"
	}
	data, err := json.MarshalIndent(layout, "", "  ")
	if err != nil {
		return fmt.Errorf("dash: marshal layout: %w", err)
	}
	return os.WriteFile(m.filePath(layout.ID), data, 0644)
}

// Create makes a new empty layout with the given name and persists it.
func (m *Manager) Create(name string) (*DashLayout, error) {
	if name == "" {
		name = "Untitled"
	}
	layout := &DashLayout{
		ID:      uuid.NewString(),
		Name:    name,
		Widgets: []DashWidget{},
	}
	if err := m.Save(layout); err != nil {
		return nil, err
	}
	return layout, nil
}

// Delete removes a layout by ID. Returns nil if the layout does not exist.
func (m *Manager) Delete(id string) error {
	err := os.Remove(m.filePath(id))
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("dash: delete layout %q: %w", id, err)
	}
	return nil
}

// filePath returns the full path for the layout file with the given ID.
func (m *Manager) filePath(id string) string {
	return filepath.Join(m.dir, id+".json")
}

// loadFirst returns the first layout found on disk, or the embedded default.
func (m *Manager) loadFirst() (*DashLayout, error) {
	entries, _ := os.ReadDir(m.dir)
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".json")
		if layout, err := m.Load(id); err == nil {
			return layout, nil
		}
	}
	return defaultLayout()
}

// migrate moves a legacy layout.json into the layouts/ directory as "Default"
// if no layouts/ directory exists yet.
func (m *Manager) migrate() error {
	if _, err := os.Stat(m.dir); err == nil {
		return nil // already migrated
	}
	if err := os.MkdirAll(m.dir, 0755); err != nil {
		return fmt.Errorf("dash: mkdir on migrate: %w", err)
	}
	data, err := os.ReadFile(m.oldPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // no legacy file — fresh install
		}
		return fmt.Errorf("dash: read legacy layout: %w", err)
	}
	var legacy DashLayout
	if jsonErr := json.Unmarshal(data, &legacy); jsonErr != nil {
		return nil // corrupt legacy file; ignore and start fresh
	}
	legacy.ID = uuid.NewString()
	legacy.Name = "Default"
	return m.Save(&legacy)
}

// defaultLayout unmarshals and returns the embedded default layout.
func defaultLayout() (*DashLayout, error) {
	var layout DashLayout
	if err := json.Unmarshal(defaultLayoutJSON, &layout); err != nil {
		return nil, fmt.Errorf("dash: parse embedded default layout: %w", err)
	}
	if layout.ID == "" {
		layout.ID = "default"
	}
	if layout.Name == "" {
		layout.Name = "Default"
	}
	return &layout, nil
}

