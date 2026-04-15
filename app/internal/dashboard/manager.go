package dashboard

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image/png"
	"io/fs"
	"os"
	"path/filepath"
	"sort"

	"github.com/google/uuid"
	"github.com/kratofl/sprint/app/internal/appdata"
	"github.com/kratofl/sprint/app/internal/commands"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
)

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
// Each layout is stored as data/layouts/<id>/config.json with an optional
// data/layouts/<id>/thumbnail.png preview image.
type Manager struct {
	dir       string
	presetsFS fs.FS
}

// NewManager creates a Manager using the standard config directory.
// presetsFS is the embedded dash presets sub-tree (fs.Sub(PresetsFS, "presets/dash")).
func NewManager(presetsFS fs.FS) *Manager {
	base := appdata.Dir()
	return &Manager{
		dir:       filepath.Join(base, "layouts"),
		presetsFS: presetsFS,
	}
}

// List returns metadata for all stored layouts.
func (m *Manager) List() ([]LayoutMeta, error) {
	entries, err := os.ReadDir(m.dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // fresh install — no layouts yet
		}
		return nil, fmt.Errorf("dash: list layouts: %w", err)
	}
	var metas []LayoutMeta
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		id := e.Name()
		layout, err := m.Load(id)
		if err != nil {
			continue // skip corrupt entries
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
// Returns nil if the layout directory does not exist.
func (m *Manager) Delete(id string) error {
	if id == EmbeddedDefaultID {
		return fmt.Errorf("dash: cannot delete the built-in default layout")
	}
	err := os.RemoveAll(m.layoutDir(id))
	if err != nil {
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
		if !e.IsDir() {
			continue
		}
		lid := e.Name()
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
	layout, err := m.defaultLayout()
	if err != nil {
		return err
	}
	layout.Default = true
	return m.Save(layout)
}

// layoutDir returns the directory path for the layout with the given ID.
func (m *Manager) layoutDir(id string) string {
	return filepath.Join(m.dir, id)
}

// filePath returns the full path for the layout config file with the given ID.
func (m *Manager) filePath(id string) string {
	return filepath.Join(m.layoutDir(id), "config.json")
}

// PreviewPath returns the full path for the preview PNG for the given layout ID.
func (m *Manager) PreviewPath(id string) string {
	return filepath.Join(m.layoutDir(id), "thumbnail.png")
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
		if !e.IsDir() {
			continue
		}
		id := e.Name()
		if layout, err := m.Load(id); err == nil {
			return layout, nil
		}
	}
	_ = m.EnsureDefault()
	return m.defaultLayout()
}

// writeFile marshals and writes a layout to disk without validation.
// After a successful write it generates a preview thumbnail (best-effort).
func (m *Manager) writeFile(layout *DashLayout) error {
	dir := m.layoutDir(layout.ID)
	if err := os.MkdirAll(dir, 0755); err != nil {
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

// defaultLayout returns the default dash layout.
// Tries <exe_dir>/DefaultDash.json first; falls back to the embedded presets FS.
func (m *Manager) defaultLayout() (*DashLayout, error) {
	if exeDir := appdata.ExeDir(); exeDir != "" {
		if data, err := os.ReadFile(filepath.Join(exeDir, "DefaultDash.json")); err == nil {
			var layout DashLayout
			if err := json.Unmarshal(data, &layout); err == nil {
				if layout.ID == "" {
					layout.ID = "default"
				}
				if layout.Name == "" {
					layout.Name = "Default"
				}
				return &layout, nil
			}
		}
	}
	if m.presetsFS != nil {
		if data, err := fs.ReadFile(m.presetsFS, "default.json"); err == nil {
			var layout DashLayout
			if err := json.Unmarshal(data, &layout); err == nil {
				if layout.ID == "" {
					layout.ID = "default"
				}
				if layout.Name == "" {
					layout.Name = "Default"
				}
				return &layout, nil
			}
		}
	}
	return nil, fmt.Errorf("dash: no default layout available")
}

// Dashboard commands — fired by input bindings or direct app actions.
const (
	CmdNextDashPage commands.Command = "dash.page.next"
	CmdPrevDashPage commands.Command = "dash.page.prev"
	CmdSetTargetLap commands.Command = "dash.target.set"
)

func init() {
	commands.RegisterMeta(CmdNextDashPage, "Next Dash Page", "Dashboard", true, true)
	commands.RegisterMeta(CmdPrevDashPage, "Prev Dash Page", "Dashboard", true, true)
	commands.RegisterMeta(CmdSetTargetLap, "Set Target Lap", "Dashboard", true, false)
}

// previewWidth and previewHeight are the dimensions for layout thumbnail previews.
// Smaller than the actual screen for fast generation and small file size.
const (
	previewWidth  = 400
	previewHeight = 240
)

// widgetPreviewCellPx is the pixel size per grid cell when rendering a single-widget
// preview. The preview canvas is sized as DefaultColSpan×widgetPreviewCellPx by
// DefaultRowSpan×widgetPreviewCellPx, so the image always has the correct aspect ratio.
const widgetPreviewCellPx = 48

// RenderWidgetPreview renders a single widget of the given type into a PNG image whose
// pixel dimensions are colSpan×widgetPreviewCellPx by rowSpan×widgetPreviewCellPx. A 1×1
// grid is used so the widget fills the entire canvas. A zero-value TelemetryFrame provides
// placeholder values — no live data required. Returns an error if the widget type is not
// registered.
func RenderWidgetPreview(widgetType string, colSpan, rowSpan int) ([]byte, error) {
	wt := widgets.WidgetType(widgetType)
	_, ok := widgets.Get(wt)
	if !ok {
		return nil, fmt.Errorf("dash: unknown widget %q", widgetType)
	}

	w := colSpan * widgetPreviewCellPx
	h := rowSpan * widgetPreviewCellPx

	layout := &DashLayout{
		ID:       "widget-preview",
		GridCols: 1,
		GridRows: 1,
		IdlePage: DashPage{ID: "idle", Name: "Idle"},
		Pages: []DashPage{{
			ID:   "p",
			Name: "p",
			Widgets: []DashWidget{{
				ID:      "w",
				Type:    wt,
				Col:     0,
				Row:     0,
				ColSpan: 1,
				RowSpan: 1,
			}},
		}},
	}

	painter := NewPainter(w, h)
	defer painter.Close()
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	img, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// renderPreview renders a PNG thumbnail of the layout's first active page.
// Uses a zero-value TelemetryFrame (all fields zero/false) so no live data needed.
// Returns nil without error if layout has no pages.
func renderPreview(layout *DashLayout) ([]byte, error) {
	if len(layout.Pages) == 0 {
		return nil, nil
	}

	painter := NewPainter(previewWidth, previewHeight)
	defer painter.Close()

	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	frame := &dto.TelemetryFrame{}
	img, err := painter.Paint(frame)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
