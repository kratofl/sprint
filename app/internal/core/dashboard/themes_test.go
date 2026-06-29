package dashboard

import (
	"image/color"
	"os"
	"testing"

	"github.com/kratofl/sprint/app/internal/core/dashboard/widgets"
)

// backupThemesFile isolates the user theme library file for a test: it starts
// from a clean (no user themes) state and restores any original on cleanup.
func backupThemesFile(t *testing.T) {
	t.Helper()
	path := themesPath()
	original, err := os.ReadFile(path)
	originalExists := err == nil
	if err != nil && !os.IsNotExist(err) {
		t.Fatalf("read themes backup: %v", err)
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		t.Fatalf("clear themes: %v", err)
	}
	t.Cleanup(func() {
		if originalExists {
			_ = os.WriteFile(path, original, 0o644)
			return
		}
		_ = os.Remove(path)
	})
}

func TestBuiltinThemePresetsArePresentAndReadOnly(t *testing.T) {
	presets := BuiltinThemePresets()
	if len(presets) == 0 {
		t.Fatal("expected built-in theme presets")
	}
	var sprint *ThemePreset
	for i := range presets {
		p := presets[i]
		if p.ID == "" || p.Name == "" {
			t.Fatalf("built-in preset missing id/name: %#v", p)
		}
		if !p.BuiltIn {
			t.Fatalf("preset %q should be marked built-in", p.ID)
		}
		if !isBuiltinThemeID(p.ID) {
			t.Fatalf("isBuiltinThemeID(%q) = false", p.ID)
		}
		if p.ID == "sprint" {
			sprint = &presets[i]
		}
	}
	if sprint == nil {
		t.Fatal("expected a 'sprint' built-in preset")
	}
	if sprint.Theme != widgets.DefaultTheme() {
		t.Fatal("'sprint' preset should mirror the compile-time default theme")
	}
}

func TestSaveThemeAssignsIDAndRoundTrips(t *testing.T) {
	backupThemesFile(t)

	saved, err := SaveTheme(ThemePreset{
		Name:          "Test",
		Theme:         widgets.DefaultTheme(),
		DomainPalette: widgets.DefaultDomainPalette(),
	})
	if err != nil {
		t.Fatalf("SaveTheme: %v", err)
	}
	if saved.ID == "" {
		t.Fatal("expected SaveTheme to assign an ID")
	}
	if saved.BuiltIn {
		t.Fatal("user theme must not be flagged built-in")
	}

	themes, err := ListThemes()
	if err != nil {
		t.Fatalf("ListThemes: %v", err)
	}
	found := false
	for _, p := range themes {
		if p.ID == saved.ID && p.Name == "Test" {
			found = true
		}
	}
	if !found {
		t.Fatalf("saved theme %q not present in ListThemes", saved.ID)
	}

	updated := *saved
	updated.Name = "Renamed"
	if _, err := SaveTheme(updated); err != nil {
		t.Fatalf("SaveTheme update: %v", err)
	}
	user, err := LoadUserThemes()
	if err != nil {
		t.Fatalf("LoadUserThemes: %v", err)
	}
	if len(user) != 1 || user[0].Name != "Renamed" {
		t.Fatalf("expected a single renamed user theme, got %#v", user)
	}
}

func TestSaveThemeRejectsBuiltinID(t *testing.T) {
	backupThemesFile(t)
	if _, err := SaveTheme(ThemePreset{ID: "sprint", Name: "Hijack"}); err == nil {
		t.Fatal("expected SaveTheme to reject a built-in id")
	}
}

func TestDeleteThemeRemovesUserAndRejectsBuiltin(t *testing.T) {
	backupThemesFile(t)

	saved, err := SaveTheme(ThemePreset{Name: "Temp", Theme: widgets.DefaultTheme()})
	if err != nil {
		t.Fatalf("SaveTheme: %v", err)
	}
	if err := DeleteTheme(saved.ID); err != nil {
		t.Fatalf("DeleteTheme: %v", err)
	}
	user, _ := LoadUserThemes()
	if len(user) != 0 {
		t.Fatalf("expected no user themes after delete, got %d", len(user))
	}
	if err := DeleteTheme("sprint"); err == nil {
		t.Fatal("expected DeleteTheme to reject a built-in id")
	}
}

func TestBuildThemeLibraryResolvesIDs(t *testing.T) {
	backupThemesFile(t)
	lib := BuildThemeLibrary()
	if _, ok := lib.Get("sprint"); !ok {
		t.Fatal("library should resolve the built-in 'sprint'")
	}
	if _, ok := lib.Get(""); ok {
		t.Fatal("empty id must not resolve")
	}
	if _, ok := lib.Get("does-not-exist"); ok {
		t.Fatal("unknown id must not resolve")
	}
}

func TestPainterResolvesReferencedThemeAsBase(t *testing.T) {
	custom := widgets.DashTheme{
		Primary: color.RGBA{R: 1, G: 2, B: 3, A: 255},
		Bg:      color.RGBA{R: 4, G: 5, B: 6, A: 255},
	}
	lib := ThemeLibrary{
		"custom": {ID: "custom", Name: "Custom", Theme: custom, DomainPalette: widgets.DefaultDomainPalette()},
	}
	p := NewPainter(800, 480)
	defer p.Close()
	p.SetThemeLibrary(lib)

	// A layout referencing the preset uses the preset palette as its base.
	got := p.resolvedTheme(&DashLayout{ThemeID: "custom"})
	if got.Primary != custom.Primary || got.Bg != custom.Bg {
		t.Fatalf("expected referenced preset colours, got primary=%v bg=%v", got.Primary, got.Bg)
	}

	// Per-layout overrides still win over the referenced preset (non-destructive).
	override := &DashLayout{ThemeID: "custom", Theme: widgets.DashTheme{Primary: color.RGBA{R: 9, G: 9, B: 9, A: 255}}}
	if p.resolvedTheme(override).Primary != (color.RGBA{R: 9, G: 9, B: 9, A: 255}) {
		t.Fatal("a per-layout override should win over the referenced preset")
	}

	// No themeId falls back to the default/global theme (no global set here).
	if p.resolvedTheme(&DashLayout{}).Primary != widgets.DefaultTheme().Primary {
		t.Fatal("an empty themeId should fall back to the default theme")
	}
}
