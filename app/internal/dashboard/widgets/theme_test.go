package widgets

import "testing"

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
