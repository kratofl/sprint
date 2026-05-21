package dashboard

import (
	"image/color"

	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
)

func clearInheritedThemeOverrides(overrides, inherited widgets.DashTheme) widgets.DashTheme {
	if overrides.Primary == inherited.Primary {
		overrides.Primary = color.RGBA{}
	}
	if overrides.Accent == inherited.Accent {
		overrides.Accent = color.RGBA{}
	}
	if overrides.Fg == inherited.Fg {
		overrides.Fg = color.RGBA{}
	}
	if overrides.Muted == inherited.Muted {
		overrides.Muted = color.RGBA{}
	}
	if overrides.Muted2 == inherited.Muted2 {
		overrides.Muted2 = color.RGBA{}
	}
	if overrides.Success == inherited.Success {
		overrides.Success = color.RGBA{}
	}
	if overrides.Warning == inherited.Warning {
		overrides.Warning = color.RGBA{}
	}
	if overrides.Danger == inherited.Danger {
		overrides.Danger = color.RGBA{}
	}
	if overrides.Surface == inherited.Surface {
		overrides.Surface = color.RGBA{}
	}
	if overrides.Bg == inherited.Bg {
		overrides.Bg = color.RGBA{}
	}
	if overrides.Border == inherited.Border {
		overrides.Border = color.RGBA{}
	}
	if overrides.RPMRed == inherited.RPMRed {
		overrides.RPMRed = color.RGBA{}
	}
	return overrides
}

func clearInheritedDomainOverrides(overrides, inherited widgets.DomainPalette) widgets.DomainPalette {
	if overrides.ABS == inherited.ABS {
		overrides.ABS = color.RGBA{}
	}
	if overrides.TC == inherited.TC {
		overrides.TC = color.RGBA{}
	}
	if overrides.BrakeBias == inherited.BrakeBias {
		overrides.BrakeBias = color.RGBA{}
	}
	if overrides.Energy == inherited.Energy {
		overrides.Energy = color.RGBA{}
	}
	if overrides.Motor == inherited.Motor {
		overrides.Motor = color.RGBA{}
	}
	if overrides.BrakeMig == inherited.BrakeMig {
		overrides.BrakeMig = color.RGBA{}
	}
	return overrides
}
