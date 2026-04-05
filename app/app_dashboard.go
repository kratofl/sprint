package main

import (
	"encoding/base64"
	"fmt"
	"os"

	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// DashListLayouts returns metadata for all saved dash layouts.
func (a *App) DashListLayouts() ([]dashboard.LayoutMeta, error) {
	metas, err := a.dash.List()
	if err != nil {
		return nil, fmt.Errorf("DashListLayouts: %w", err)
	}
	return metas, nil
}

// DashLoadLayoutByID reads the dash layout with the given ID from disk.
// If id is empty, the first available layout is returned.
func (a *App) DashLoadLayoutByID(id string) (*dashboard.DashLayout, error) {
	layout, err := a.dash.Load(id)
	if err != nil {
		return nil, fmt.Errorf("DashLoadLayoutByID: %w", err)
	}
	return layout, nil
}

// DashLoadLayout reads the first available dash layout (or the embedded default).
// Kept for backward compatibility with any existing callers.
func (a *App) DashLoadLayout() (*dashboard.DashLayout, error) {
	return a.DashLoadLayoutByID("")
}

// DashSaveLayout writes the layout to disk and hot-reloads the VoCore renderer
// if the saved layout is the one currently active in the coordinator.
func (a *App) DashSaveLayout(layout dashboard.DashLayout) error {
	if err := a.dash.Save(&layout); err != nil {
		return fmt.Errorf("DashSaveLayout: %w", err)
	}
	if a.coord.CurrentLayoutID() == layout.ID {
		a.coord.SetDashLayout(&layout)
		runtime.EventsEmit(a.ctx, "dash:layout-updated", layout)
	}
	return nil
}

// DashCreateLayout creates a new named dash layout and returns it.
func (a *App) DashCreateLayout(name string) (*dashboard.DashLayout, error) {
	layout, err := a.dash.Create(name)
	if err != nil {
		return nil, fmt.Errorf("DashCreateLayout: %w", err)
	}
	return layout, nil
}

// DashDeleteLayout deletes the layout with the given ID.
// If the deleted layout was active on the current screen, the default layout
// is loaded and pushed to the coordinator so the screen doesn't go blank.
func (a *App) DashDeleteLayout(id string) error {
	wasActive := a.isLayoutActive(id)
	if err := a.dash.Delete(id); err != nil {
		return fmt.Errorf("DashDeleteLayout: %w", err)
	}
	if wasActive {
		if defaultLayout, err := a.dash.Load(""); err == nil {
			a.coord.SetDashLayout(defaultLayout)
		}
	}
	return nil
}

// DashSetDefault marks the layout with the given ID as the default.
func (a *App) DashSetDefault(id string) error {
	if err := a.dash.SetDefault(id); err != nil {
		return fmt.Errorf("DashSetDefault: %w", err)
	}
	return nil
}

// GetWidgetCatalog returns metadata for all registered widgets (for the editor palette).
func (a *App) GetWidgetCatalog() []widgets.WidgetMeta {
	return widgets.WidgetCatalog()
}

// DashGetPreview returns a base64-encoded PNG preview image for the given layout ID.
// Returns an empty string if no preview is available.
func (a *App) DashGetPreview(id string) string {
	data, err := os.ReadFile(a.dash.PreviewPath(id))
	if err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(data)
}

// DashCyclePage cycles the active dash page by direction: +1 for next, -1 for prev.
func (a *App) DashCyclePage(direction int) {
	a.coord.CyclePage(direction)
}

// isLayoutActive reports whether the given layout ID is assigned to the active screen.
func (a *App) isLayoutActive(layoutID string) bool {
	reg, err := a.devMgr.Load()
	if err != nil {
		return false
	}
	active := devices.ActiveScreen(reg)
	if active == nil {
		return false
	}
	// An empty DashID means "use default" — treat any layout as active if no assignment.
	if active.DashID == "" || active.DashID == layoutID {
		return true
	}
	return false
}
