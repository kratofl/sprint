package main

import (
	"encoding/base64"
	"fmt"
	"os"

	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/kratofl/sprint/app/internal/devices"
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

// DashSaveLayout writes the layout to disk and hot-reloads all screens whose
// current layout matches the saved ID.
func (a *App) DashSaveLayout(layout dashboard.DashLayout) error {
	if err := a.dash.Save(&layout); err != nil {
		return fmt.Errorf("DashSaveLayout: %w", err)
	}
	a.coord.UpdateLayout(&layout)
	return nil
}

// DashCreateLayout creates a new named dash layout inheriting the global
// default theme and domain palette, then returns the persisted layout.
func (a *App) DashCreateLayout(name string) (*dashboard.DashLayout, error) {
	layout, err := a.dash.Create(name)
	if err != nil {
		return nil, fmt.Errorf("DashCreateLayout: %w", err)
	}
	gs, err := dashboard.LoadGlobalSettings()
	if err == nil {
		layout.Theme = gs.Theme
		layout.DomainPalette = gs.DomainPalette
		_ = a.dash.Save(layout) // best-effort: apply global defaults to the new layout
	}
	return layout, nil
}

// DashGetGlobalSettings returns the global dash settings (theme + domain palette defaults).
func (a *App) DashGetGlobalSettings() (*dashboard.GlobalDashSettings, error) {
	s, err := dashboard.LoadGlobalSettings()
	if err != nil {
		return nil, fmt.Errorf("DashGetGlobalSettings: %w", err)
	}
	return s, nil
}

// DashSaveGlobalSettings writes the global dash settings to disk.
func (a *App) DashSaveGlobalSettings(s dashboard.GlobalDashSettings) error {
	if err := dashboard.SaveGlobalSettings(&s); err != nil {
		return fmt.Errorf("DashSaveGlobalSettings: %w", err)
	}
	return nil
}

// DashGetDefaultTheme returns the compile-time default DashTheme.
// Used by the editor to offer a "reset to default" action.
func (a *App) DashGetDefaultTheme() widgets.DashTheme {
	return widgets.DefaultTheme()
}

// DashGetDefaultDomainPalette returns the compile-time default DomainPalette.
// Used by the editor to offer a "reset to default" action.
func (a *App) DashGetDefaultDomainPalette() widgets.DomainPalette {
	return widgets.DefaultDomainPalette()
}

// DashDeleteLayout deletes the layout with the given ID.
// Any screen currently showing that layout is switched to the default.
func (a *App) DashDeleteLayout(id string) error {
	if err := a.dash.Delete(id); err != nil {
		return fmt.Errorf("DashDeleteLayout: %w", err)
	}
	defaultLayout, _ := a.dash.Load("")
	if defaultLayout == nil {
		return nil
	}
	reg, _ := a.devMgr.Load()
	if reg == nil {
		return nil
	}
	for i := range reg.Devices {
		d := &reg.Devices[i]
		if !d.HasScreen() {
			continue
		}
		if d.DashID == id || d.DashID == "" {
			deviceID := devices.DeviceID(d.VID, d.PID, d.Serial)
			a.coord.SetDashLayout(deviceID, defaultLayout)
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

// GetWidgetPreview renders a single widget of the given type into a PNG sized to
// match the widget's default grid span, and returns it as a base64-encoded string.
// Returns an empty string if the widget type is unknown or rendering fails.
func (a *App) GetWidgetPreview(widgetType string) string {
	data, err := dashboard.RenderWidgetPreview(widgetType)
	if err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(data)
}

// DashCyclePage cycles the active dash page by direction: +1 for next, -1 for prev.
// Broadcasts to all connected screen-capable devices.
func (a *App) DashCyclePage(direction int) {
	a.coord.CyclePage("", direction)
}

// isLayoutActive reports whether any screen-capable device is currently using layoutID.
func (a *App) isLayoutActive(layoutID string) bool {
	reg, err := a.devMgr.Load()
	if err != nil {
		return false
	}
	for _, d := range reg.Devices {
		if !d.HasScreen() {
			continue
		}
		if d.DashID == "" || d.DashID == layoutID {
			return true
		}
	}
	return false
}
