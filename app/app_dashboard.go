package main

import (
	"fmt"

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
// if the saved layout is the one currently assigned to the active screen.
func (a *App) DashSaveLayout(layout dashboard.DashLayout) error {
	if err := a.dash.Save(&layout); err != nil {
		return fmt.Errorf("DashSaveLayout: %w", err)
	}
	if a.isLayoutActive(layout.ID) {
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
func (a *App) DashDeleteLayout(id string) error {
	if err := a.dash.Delete(id); err != nil {
		return fmt.Errorf("DashDeleteLayout: %w", err)
	}
	return nil
}

// GetWidgetCatalog returns metadata for all registered widgets (for the editor palette).
func (a *App) GetWidgetCatalog() []widgets.WidgetMeta {
	return widgets.WidgetCatalog()
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
