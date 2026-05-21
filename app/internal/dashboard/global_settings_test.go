package dashboard

import (
	"image/color"
	"testing"

	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
)

func TestFillGlobalDefaultsMigratesLegacyThemeToSharedTokens(t *testing.T) {
	settings := &GlobalDashSettings{Theme: legacyDefaultTheme()}

	fillGlobalDefaults(settings)

	if settings.Theme != widgets.DefaultTheme() {
		t.Fatalf("expected legacy theme to migrate to shared tokens, got %#v", settings.Theme)
	}
}

func TestFillGlobalDefaultsPreservesCustomTheme(t *testing.T) {
	custom := widgets.DefaultTheme()
	custom.Accent = color.RGBA{R: 12, G: 34, B: 56, A: 255}
	settings := &GlobalDashSettings{Theme: custom}

	fillGlobalDefaults(settings)

	if settings.Theme != custom {
		t.Fatalf("expected custom theme to be preserved, got %#v", settings.Theme)
	}
}
