package main

import (
	"fmt"

	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// DashLoadLayout reads the saved dashboard layout from disk. If no layout has
// been saved yet, the embedded default layout is returned so the editor always
// has something to start from.
func (a *App) DashLoadLayout() (*dashboard.DashLayout, error) {
	layout, err := a.dash.Load()
	if err != nil {
		return nil, fmt.Errorf("DashLoadLayout: %w", err)
	}
	return layout, nil
}

// DashSaveLayout writes the layout to disk and hot-reloads the VoCore renderer.
func (a *App) DashSaveLayout(layout dashboard.DashLayout) error {
	if err := a.dash.Save(&layout); err != nil {
		return fmt.Errorf("DashSaveLayout: %w", err)
	}
	a.coord.SetDashLayout(&layout)
	runtime.EventsEmit(a.ctx, "dash:layout-updated", layout)
	return nil
}

// GetWidgetCatalog returns metadata for all registered widgets (for the editor palette).
func (a *App) GetWidgetCatalog() []widgets.WidgetMeta {
	return widgets.WidgetCatalog()
}
