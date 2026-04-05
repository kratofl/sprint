package dashboard

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/kratofl/sprint/app/internal/appdata"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
)

//go:embed default.json
var defaultLayoutJSON []byte

// LayoutMeta is a lightweight descriptor returned by List (no widget data).
type LayoutMeta struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Default          bool   `json:"default"`
	PageCount        int    `json:"pageCount"`
	GridCols         int    `json:"gridCols"`
	GridRows         int    `json:"gridRows"`
	PreviewAvailable bool   `json:"previewAvailable"`
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

// List returns metadata for all stored layouts.
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
		metas = append(metas, LayoutMeta{
			ID:               layout.ID,
			Name:             layout.Name,
			Default:          layout.Default,
			PageCount:        len(layout.Pages),
			GridCols:         layout.GridCols,
			GridRows:         layout.GridRows,
			PreviewAvailable: m.previewExists(id),
		})
	}
	sort.Slice(metas, func(i, j int) bool {
		if metas[i].Default != metas[j].Default {
			return metas[i].Default
		}
		return metas[i].Name < metas[j].Name
	})
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
	path := m.filePath(id)
	return migrateLayoutFormat(data, path)
}

// Save validates and writes a layout to disk. A new UUID is assigned if layout.ID is empty.
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
	if layout.GridCols == 0 {
		layout.GridCols = DefaultGridCols
	}
	if layout.GridRows == 0 {
		layout.GridRows = DefaultGridRows
	}
	if err := ValidateLayout(layout); err != nil {
		return err
	}
	return m.writeFile(layout)
}

// Create makes a new empty layout with the given name and persists it.
func (m *Manager) Create(name string) (*DashLayout, error) {
	if name == "" {
		name = "Untitled"
	}
	layout := &DashLayout{
		ID:       uuid.NewString(),
		Name:     name,
		Default:  false,
		GridCols: DefaultGridCols,
		GridRows: DefaultGridRows,
		IdlePage: NewPage("Idle"),
		Pages:    []DashPage{NewPage("Main")},
		Alerts:   AlertConfig{},
	}
	if err := m.Save(layout); err != nil {
		return nil, err
	}
	return layout, nil
}

// EmbeddedDefaultID is the fixed layout ID for the app-shipped default dash.
const EmbeddedDefaultID = "default"

// Delete removes a layout by ID.
// The embedded default layout (ID "default") can never be deleted.
// Returns nil if the layout file does not exist.
func (m *Manager) Delete(id string) error {
	if id == EmbeddedDefaultID {
		return fmt.Errorf("dash: cannot delete the built-in default layout")
	}
	err := os.Remove(m.filePath(id))
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("dash: delete layout %q: %w", id, err)
	}
	return nil
}

// SetDefault marks the layout with the given ID as default and clears all others.
func (m *Manager) SetDefault(id string) error {
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		return fmt.Errorf("dash: set default: %w", err)
	}
	found := false
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		lid := strings.TrimSuffix(e.Name(), ".json")
		layout, err := m.Load(lid)
		if err != nil {
			continue
		}
		want := (lid == id)
		if want {
			found = true
		}
		if layout.Default != want {
			layout.Default = want
			_ = m.writeFile(layout) // best-effort
		}
	}
	if !found {
		return fmt.Errorf("dash: layout %q not found", id)
	}
	return nil
}

// EnsureDefault creates a default layout from the embedded template if none exists.
func (m *Manager) EnsureDefault() error {
	metas, err := m.List()
	if err != nil {
		return err
	}
	for _, meta := range metas {
		if meta.Default {
			return nil
		}
	}
	layout, err := defaultLayout()
	if err != nil {
		return err
	}
	layout.Default = true
	return m.Save(layout)
}

// filePath returns the full path for the layout file with the given ID.
func (m *Manager) filePath(id string) string {
	return filepath.Join(m.dir, id+".json")
}

// PreviewPath returns the full path for the preview PNG for the given layout ID.
func (m *Manager) PreviewPath(id string) string {
	return filepath.Join(m.dir, id+".png")
}

// previewExists reports whether a preview PNG exists for the given layout ID.
func (m *Manager) previewExists(id string) bool {
	_, err := os.Stat(m.PreviewPath(id))
	return err == nil
}

// loadFirst returns the first layout found on disk, or saves and returns the embedded default.
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
	_ = m.EnsureDefault()
	return defaultLayout()
}

// migrate moves a legacy layout.json into the layouts/ directory.
// If no legacy file exists this is a no-op (fresh install).
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
	layout, err := migrateLayoutFormat(data, "")
	if err != nil {
		return nil // corrupt legacy file; ignore and start fresh
	}
	layout.ID = uuid.NewString()
	layout.Name = "Default"
	layout.Default = true
	return m.writeFile(layout)
}

// migrateLayoutFormat detects and converts a legacy pixel-based layout to the
// current grid format. If the data already contains "pages" or "gridCols" it is
// already in the new multi-page format and is returned unchanged. Otherwise the
// flat "widgets" array with pixel x/y/w/h fields is converted: each pixel value
// is divided by 40 and rounded to the nearest grid unit.
// If path is non-empty and conversion occurred, the file is overwritten in-place.
func migrateLayoutFormat(data []byte, path string) (*DashLayout, error) {
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(data, &probe); err != nil {
		return nil, fmt.Errorf("dash: parse layout: %w", err)
	}
	_, hasPages := probe["pages"]
	_, hasGridCols := probe["gridCols"]
	if hasPages || hasGridCols {
		var layout DashLayout
		if err := json.Unmarshal(data, &layout); err != nil {
			return nil, fmt.Errorf("dash: parse layout: %w", err)
		}
		return &layout, nil
	}

	type legacyWidget struct {
		ID     string             `json:"id"`
		Type   widgets.WidgetType `json:"type"`
		X      int                `json:"x"`
		Y      int                `json:"y"`
		W      int                `json:"w"`
		H      int                `json:"h"`
		Config map[string]any     `json:"config,omitempty"`
	}
	type legacyLayout struct {
		ID      string         `json:"id"`
		Name    string         `json:"name"`
		Widgets []legacyWidget `json:"widgets"`
	}
	var legacy legacyLayout
	if err := json.Unmarshal(data, &legacy); err != nil {
		return nil, fmt.Errorf("dash: parse legacy layout: %w", err)
	}

	mainPage := NewPage("Main")
	for _, lw := range legacy.Widgets {
		col := pixelToGrid(lw.X)
		if col < 0 {
			col = 0
		}
		row := pixelToGrid(lw.Y)
		if row < 0 {
			row = 0
		}
		colSpan := pixelToGrid(lw.W)
		if colSpan < 1 {
			colSpan = 1
		}
		rowSpan := pixelToGrid(lw.H)
		if rowSpan < 1 {
			rowSpan = 1
		}
		mainPage.Widgets = append(mainPage.Widgets, DashWidget{
			ID:      lw.ID,
			Type:    lw.Type,
			Col:     col,
			Row:     row,
			ColSpan: colSpan,
			RowSpan: rowSpan,
			Config:  lw.Config,
		})
	}
	id := legacy.ID
	if id == "" {
		id = uuid.NewString()
	}
	name := legacy.Name
	if name == "" {
		name = "Untitled"
	}
	layout := &DashLayout{
		ID:       id,
		Name:     name,
		Default:  false,
		GridCols: DefaultGridCols,
		GridRows: DefaultGridRows,
		IdlePage: NewPage("Idle"),
		Pages:    []DashPage{mainPage},
		Alerts:   AlertConfig{},
	}
	if path != "" {
		if out, err := json.MarshalIndent(layout, "", "  "); err == nil {
			_ = os.WriteFile(path, out, 0644)
		}
	}
	return layout, nil
}

// pixelToGrid converts a pixel coordinate to a grid unit by dividing by the
// 40-pixel cell size and rounding to the nearest integer.
func pixelToGrid(px int) int {
	return int(math.Round(float64(px) / 40))
}

// writeFile marshals and writes a layout to disk without validation.
// After a successful write it generates a preview thumbnail (best-effort).
func (m *Manager) writeFile(layout *DashLayout) error {
	if err := os.MkdirAll(m.dir, 0755); err != nil {
		return fmt.Errorf("dash: mkdir: %w", err)
	}
	data, err := json.MarshalIndent(layout, "", "  ")
	if err != nil {
		return fmt.Errorf("dash: marshal layout: %w", err)
	}
	if err := os.WriteFile(m.filePath(layout.ID), data, 0644); err != nil {
		return err
	}
	if pngBytes, err := renderPreview(layout); err == nil && pngBytes != nil {
		_ = os.WriteFile(m.PreviewPath(layout.ID), pngBytes, 0644)
	}
	return nil
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

