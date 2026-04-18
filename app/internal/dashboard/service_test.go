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
	globalPrefs []widgets.FormatPreferences
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
}

func TestServiceSaveGlobalSettingsUpdatesCoordinatorPreferences(t *testing.T) {
	manager := &Manager{dir: t.TempDir()}
	runtime := &fakeDashboardRuntime{}
	service := NewService(manager, &fakeDeviceStore{}, runtime)

	settings := &GlobalDashSettings{
		Theme:             widgets.DefaultTheme(),
		DomainPalette:     widgets.DefaultDomainPalette(),
		FormatPreferences: widgets.FormatPreferences{SpeedUnit: widgets.SpeedMPH},
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
}
