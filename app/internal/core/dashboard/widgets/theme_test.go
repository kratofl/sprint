package widgets

import (
	"image/color"
	"testing"
)

func TestDefaultThemeMatchesSharedTokens(t *testing.T) {
	theme := DefaultTheme()
	domain := DefaultDomainPalette()

	assertColorEqual(t, "theme.primary", theme.Primary, ColorPrimary, 255, 144, 108, 255)
	assertColorEqual(t, "theme.accent", theme.Accent, ColorAccent, 79, 156, 255, 255)
	assertColorEqual(t, "theme.fg", theme.Fg, ColorForeground, 246, 240, 230, 255)
	assertColorEqual(t, "theme.muted", theme.Muted, ColorMuted, 169, 160, 149, 255)
	assertColorEqual(t, "theme.muted2", theme.Muted2, ColorSecondary, 200, 191, 178, 255)
	assertColorEqual(t, "theme.success", theme.Success, ColorSuccess, 52, 211, 153, 255)
	assertColorEqual(t, "theme.warning", theme.Warning, ColorWarning, 251, 191, 36, 255)
	assertColorEqual(t, "theme.danger", theme.Danger, ColorDanger, 255, 59, 48, 255)
	assertColorEqual(t, "theme.surface", theme.Surface, ColorSurface, 18, 17, 15, 255)
	assertColorEqual(t, "theme.bg", theme.Bg, ColorBackground, 9, 9, 7, 255)
	assertColorEqual(t, "theme.border", theme.Border, ColorBorder, 111, 103, 95, 255)
	assertColorEqual(t, "domain.tc", domain.TC, ColorAccent, 79, 156, 255, 255)
	assertColorEqual(t, "domain.motor", domain.Motor, ColorPrimary, 255, 144, 108, 255)
}

func TestRenderThemeTypographyPrecedence(t *testing.T) {
	rt := RenderTheme{
		Typography:       TypographySettings{Font: FontBold, LabelFont: FontMono, FontScale: 1.2},
		GlobalTypography: TypographySettings{Font: FontLabel, LabelFont: FontBold, FontScale: 1.1},
		Style:            WidgetStyle{Font: FontNumber, LabelFont: FontLabel, FontSize: 1.4},
	}

	if got := rt.ResolveFont(FontNumber); got != FontNumber {
		t.Fatalf("expected widget value font override to win, got %q", got)
	}
	if got := rt.ResolveFont(FontLabel); got != FontLabel {
		t.Fatalf("expected widget label font override to win, got %q", got)
	}
	if got := rt.FontScale(); got != 1.4 {
		t.Fatalf("expected widget font scale override to win, got %.2f", got)
	}

	rt.Style = WidgetStyle{}
	if got := rt.ResolveFont(FontNumber); got != FontBold {
		t.Fatalf("expected per-dash value font to win, got %q", got)
	}
	if got := rt.ResolveFont(FontLabel); got != FontMono {
		t.Fatalf("expected per-dash label font to win, got %q", got)
	}
	if got := rt.FontScale(); got != 1.2 {
		t.Fatalf("expected per-dash font scale to win, got %.2f", got)
	}

	rt.Typography = TypographySettings{}
	if got := rt.ResolveFont(FontNumber); got != FontLabel {
		t.Fatalf("expected global value font to win when dash typography is unset, got %q", got)
	}
	if got := rt.ResolveFont(FontLabel); got != FontBold {
		t.Fatalf("expected global label font to win when dash typography is unset, got %q", got)
	}
	if got := rt.FontScale(); got != 1.1 {
		t.Fatalf("expected global font scale to win when dash typography is unset, got %.2f", got)
	}
}

func TestMergeThemeAppliesSparseOverrides(t *testing.T) {
	base := DefaultTheme()
	override := DashTheme{
		Accent: color.RGBA{R: 1, G: 2, B: 3, A: 255},
		Bg:     color.RGBA{R: 9, G: 8, B: 7, A: 255},
	}

	merged := MergeTheme(base, override)

	if merged.Primary != base.Primary {
		t.Fatalf("expected primary to inherit from base, got %#v", merged.Primary)
	}
	if merged.Accent != override.Accent {
		t.Fatalf("expected accent override %#v, got %#v", override.Accent, merged.Accent)
	}
	if merged.Bg != override.Bg {
		t.Fatalf("expected bg override %#v, got %#v", override.Bg, merged.Bg)
	}
}

func TestMergeThemeMigratesLegacyDefaultColorsPerField(t *testing.T) {
	base := DefaultTheme()
	override := DashTheme{
		Fg:      color.RGBA{R: 255, G: 255, B: 255, A: 255},
		Muted:   color.RGBA{R: 128, G: 128, B: 128, A: 255},
		Primary: color.RGBA{R: 1, G: 2, B: 3, A: 255},
	}

	merged := MergeTheme(base, override)

	if merged.Fg != base.Fg {
		t.Fatalf("expected legacy fg to migrate to %#v, got %#v", base.Fg, merged.Fg)
	}
	if merged.Muted != base.Muted {
		t.Fatalf("expected legacy muted to migrate to %#v, got %#v", base.Muted, merged.Muted)
	}
	if merged.Primary != override.Primary {
		t.Fatalf("expected custom primary to be preserved, got %#v", merged.Primary)
	}
}

func TestMergeDomainPaletteAppliesSparseOverrides(t *testing.T) {
	base := DefaultDomainPalette()
	override := DomainPalette{
		TC:       color.RGBA{R: 3, G: 4, B: 5, A: 255},
		BrakeMig: color.RGBA{R: 6, G: 7, B: 8, A: 255},
	}

	merged := MergeDomainPalette(base, override)

	if merged.ABS != base.ABS {
		t.Fatalf("expected ABS to inherit from base, got %#v", merged.ABS)
	}
	if merged.TC != override.TC {
		t.Fatalf("expected TC override %#v, got %#v", override.TC, merged.TC)
	}
	if merged.BrakeMig != override.BrakeMig {
		t.Fatalf("expected BrakeMig override %#v, got %#v", override.BrakeMig, merged.BrakeMig)
	}
}

func assertColorEqual(t *testing.T, name string, got, want color.RGBA, r, g, b, a uint8) {
	t.Helper()

	expected := color.RGBA{R: r, G: g, B: b, A: a}
	if got != expected {
		t.Fatalf("%s mismatch: got %#v, want %#v", name, got, expected)
	}
	if want != expected {
		t.Fatalf("%s token mismatch: got %#v, want %#v", name, want, expected)
	}
}
