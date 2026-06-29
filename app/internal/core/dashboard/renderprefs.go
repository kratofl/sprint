package dashboard

import "github.com/kratofl/sprint/app/internal/core/dashboard/widgets"

// RenderPreferences is the bundle of global, app-level rendering settings every
// screen painter needs: dash theme, domain palette, format preferences (units),
// typography, the theme-preset library, and the render profile (driver
// identity).
//
// The coordinator owns the single authoritative value and broadcasts it to all
// screen drivers and the editor preview painter through one
// ApplyRenderPreferences call, replacing six separate SetGlobal* broadcasts that
// callers previously had to keep in sync. See CONTEXT.md.
type RenderPreferences struct {
	Theme         widgets.DashTheme
	DomainPalette widgets.DomainPalette
	FormatPrefs   widgets.FormatPreferences
	Typography    widgets.TypographySettings
	ThemeLibrary  ThemeLibrary
	Profile       RenderProfile
}

// DefaultRenderPreferences returns the canonical default bundle: the theme,
// domain palette, and format preferences used for a fresh global-settings file,
// plus the built-in theme library. Typography and profile default to their zero
// values. These are exactly the fallbacks a Painter applies when no global
// override is set, so seeding a coordinator or driver with this bundle changes
// nothing it would otherwise render.
func DefaultRenderPreferences() RenderPreferences {
	return RenderPreferences{
		Theme:         widgets.DefaultTheme(),
		DomainPalette: widgets.DefaultDomainPalette(),
		FormatPrefs:   widgets.DefaultFormatPreferences(),
		ThemeLibrary:  BuildThemeLibrary(),
	}
}
