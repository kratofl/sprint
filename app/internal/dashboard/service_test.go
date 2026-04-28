package dashboard

import (
	"os"
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
	globalThemes     []widgets.DashTheme
	globalDomains    []widgets.DomainPalette
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

func (f *fakeDashboardRuntime) SetGlobalTheme(theme widgets.DashTheme) {
	f.globalThemes = append(f.globalThemes, theme)
}

func (f *fakeDashboardRuntime) SetGlobalDomainPalette(domain widgets.DomainPalette) {
	f.globalDomains = append(f.globalDomains, domain)
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
	restore := seedTestGlobalSettings(t, defaultGlobalSettings())
	defer restore()

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
	if len(runtime.globalThemes) != 1 {
		t.Fatalf("expected one runtime global theme update, got %d", len(runtime.globalThemes))
	}
	if len(runtime.globalDomains) != 1 {
		t.Fatalf("expected one runtime global domain update, got %d", len(runtime.globalDomains))
	}
}

func TestServiceCreateLayoutStartsWithInheritedThemeAndDomain(t *testing.T) {
	manager := &Manager{dir: t.TempDir()}
	runtime := &fakeDashboardRuntime{}
	service := NewService(manager, &fakeDeviceStore{}, runtime)

	settings := defaultGlobalSettings()
	settings.Theme.Accent = widgets.ColorDanger
	settings.DomainPalette.TC = widgets.ColorDanger
	restore := seedTestGlobalSettings(t, settings)
	defer restore()

	layout, err := service.CreateLayout("Inherited")
	if err != nil {
		t.Fatalf("CreateLayout: %v", err)
	}

	if layout.Theme != (widgets.DashTheme{}) {
		t.Fatalf("expected new layout theme overrides to be empty, got %#v", layout.Theme)
	}
	if layout.DomainPalette != (widgets.DomainPalette{}) {
		t.Fatalf("expected new layout domain overrides to be empty, got %#v", layout.DomainPalette)
	}
}

func TestServiceSaveGlobalSettingsClearsInheritedLayoutColorOverrides(t *testing.T) {
	manager := &Manager{dir: t.TempDir()}
	runtime := &fakeDashboardRuntime{}
	service := NewService(manager, &fakeDeviceStore{}, runtime)

	previous := defaultGlobalSettings()
	restore := seedTestGlobalSettings(t, previous)
	defer restore()

	inherited := &DashLayout{
		Name:          "Inherited",
		GridCols:      DefaultGridCols,
		GridRows:      DefaultGridRows,
		IdlePage:      NewPage("Idle"),
		Pages:         []DashPage{NewPage("Main")},
		Theme:         previous.Theme,
		DomainPalette: previous.DomainPalette,
	}
	if err := manager.Save(inherited); err != nil {
		t.Fatalf("Save inherited layout: %v", err)
	}

	customTheme := previous.Theme
	customTheme.Accent = widgets.ColorDanger
	customDomain := previous.DomainPalette
	customDomain.TC = widgets.ColorDanger
	custom := &DashLayout{
		Name:          "Custom",
		GridCols:      DefaultGridCols,
		GridRows:      DefaultGridRows,
		IdlePage:      NewPage("Idle"),
		Pages:         []DashPage{NewPage("Main")},
		Theme:         customTheme,
		DomainPalette: customDomain,
	}
	if err := manager.Save(custom); err != nil {
		t.Fatalf("Save custom layout: %v", err)
	}

	next := defaultGlobalSettings()
	next.Theme.Accent = widgets.ColorPrimary
	next.DomainPalette.TC = widgets.ColorPrimary
	if err := service.SaveGlobalSettings(next); err != nil {
		t.Fatalf("SaveGlobalSettings: %v", err)
	}

	reloadedInherited, err := manager.Load(inherited.ID)
	if err != nil {
		t.Fatalf("Load inherited layout: %v", err)
	}
	if reloadedInherited.Theme != (widgets.DashTheme{}) {
		t.Fatalf("expected inherited theme overrides to be cleared, got %#v", reloadedInherited.Theme)
	}
	if reloadedInherited.DomainPalette != (widgets.DomainPalette{}) {
		t.Fatalf("expected inherited domain overrides to be cleared, got %#v", reloadedInherited.DomainPalette)
	}

	reloadedCustom, err := manager.Load(custom.ID)
	if err != nil {
		t.Fatalf("Load custom layout: %v", err)
	}
	if reloadedCustom.Theme.Accent != widgets.ColorDanger {
		t.Fatalf("expected custom accent override to be preserved, got %#v", reloadedCustom.Theme.Accent)
	}
	if reloadedCustom.Theme.Primary != (widgets.DashTheme{}).Primary {
		t.Fatalf("expected inherited primary token to be cleared, got %#v", reloadedCustom.Theme.Primary)
	}
	if reloadedCustom.DomainPalette.TC != widgets.ColorDanger {
		t.Fatalf("expected custom TC override to be preserved, got %#v", reloadedCustom.DomainPalette.TC)
	}
	if reloadedCustom.DomainPalette.ABS != (widgets.DomainPalette{}).ABS {
		t.Fatalf("expected inherited ABS token to be cleared, got %#v", reloadedCustom.DomainPalette.ABS)
	}
	if len(runtime.updatedLayouts) != 2 {
		t.Fatalf("expected rewritten layouts to be pushed to runtime, got %#v", runtime.updatedLayouts)
	}
}

func seedTestGlobalSettings(t *testing.T, settings *GlobalDashSettings) func() {
	t.Helper()

	path := globalSettingsPath()
	original, err := os.ReadFile(path)
	originalExists := err == nil
	if err != nil && !os.IsNotExist(err) {
		t.Fatalf("read global settings backup: %v", err)
	}

	if err := SaveGlobalSettings(settings); err != nil {
		t.Fatalf("seed global settings: %v", err)
	}

	return func() {
		if originalExists {
			if err := os.WriteFile(path, original, 0o644); err != nil {
				t.Fatalf("restore global settings: %v", err)
			}
			return
		}
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			t.Fatalf("remove global settings: %v", err)
		}
	}
}
