package dashboard

import (
	"testing"

	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
)

type fakeDeviceStore struct {
	reg *devices.DeviceRegistry
}

func (f *fakeDeviceStore) Load() (*devices.DeviceRegistry, error) {
	if f.reg == nil {
		return &devices.DeviceRegistry{}, nil
	}
	return f.reg, nil
}

type fakeDashboardRuntime struct {
	updatedLayouts []string
	assigned       []struct {
		deviceID string
		layoutID string
	}
	globalPrefs      []widgets.FormatPreferences
	globalTypography []widgets.TypographySettings
	reloadCommands   int
}

func (f *fakeDashboardRuntime) UpdateLayout(layout *DashLayout) {
	f.updatedLayouts = append(f.updatedLayouts, layout.ID)
}

func (f *fakeDashboardRuntime) SetDashLayout(deviceID string, layout *DashLayout) {
	f.assigned = append(f.assigned, struct {
		deviceID string
		layoutID string
	}{deviceID: deviceID, layoutID: layout.ID})
}

func (f *fakeDashboardRuntime) SetGlobalFormatPrefs(prefs widgets.FormatPreferences) {
	f.globalPrefs = append(f.globalPrefs, prefs)
}

func (f *fakeDashboardRuntime) SetGlobalTypography(typography widgets.TypographySettings) {
	f.globalTypography = append(f.globalTypography, typography)
}

func (f *fakeDashboardRuntime) ReloadDashCommands() {
	f.reloadCommands++
}

func TestServiceSaveLayoutPersistsAndRefreshesActiveLayout(t *testing.T) {
	manager := &Manager{dir: t.TempDir()}
	runtime := &fakeDashboardRuntime{}
	service := NewService(manager, &fakeDeviceStore{}, runtime)

	layout := &DashLayout{
		Name:     "Qualifying",
		GridCols: DefaultGridCols,
		GridRows: DefaultGridRows,
		IdlePage: NewPage("Idle"),
		Pages:    []DashPage{NewPage("Main")},
	}

	if err := service.SaveLayout(layout); err != nil {
		t.Fatalf("SaveLayout: %v", err)
	}

	if layout.ID == "" {
		t.Fatal("expected SaveLayout to assign an ID")
	}
	if len(runtime.updatedLayouts) != 1 || runtime.updatedLayouts[0] != layout.ID {
		t.Fatalf("expected runtime layout update for %s, got %#v", layout.ID, runtime.updatedLayouts)
	}
	if runtime.reloadCommands != 1 {
		t.Fatalf("expected SaveLayout to rebuild dynamic commands once, got %d", runtime.reloadCommands)
	}
}

func TestServiceSaveGlobalSettingsUpdatesCoordinatorPreferences(t *testing.T) {
	manager := &Manager{dir: t.TempDir()}
	runtime := &fakeDashboardRuntime{}
	service := NewService(manager, &fakeDeviceStore{}, runtime)

	settings := &GlobalDashSettings{
		Theme:             widgets.DefaultTheme(),
		DomainPalette:     widgets.DefaultDomainPalette(),
		FormatPreferences: widgets.FormatPreferences{SpeedUnit: widgets.SpeedMPH},
		Typography:        widgets.TypographySettings{Font: widgets.FontBold, FontScale: 1.2},
	}

	if err := service.SaveGlobalSettings(settings); err != nil {
		t.Fatalf("SaveGlobalSettings: %v", err)
	}

	if len(runtime.globalPrefs) != 1 {
		t.Fatalf("expected one runtime global preference update, got %d", len(runtime.globalPrefs))
	}
	if runtime.globalPrefs[0].SpeedUnit != widgets.SpeedMPH {
		t.Fatalf("expected speed unit mph, got %q", runtime.globalPrefs[0].SpeedUnit)
	}
	if len(runtime.globalTypography) != 1 {
		t.Fatalf("expected one runtime typography update, got %d", len(runtime.globalTypography))
	}
	if runtime.globalTypography[0].Font != widgets.FontBold {
		t.Fatalf("expected typography font %q, got %q", widgets.FontBold, runtime.globalTypography[0].Font)
	}
}
