package widgets

import (
	"image/color"
)

// Sprint design-system palette — mirrors packages/tokens/src/atoms/colors.ts + molecules/surfaces.ts.
var (
	// Surfaces
	ColorBackground = color.RGBA{10, 10, 10, 255} // #0a0a0a  surfaces.base
	ColorSurface    = color.RGBA{20, 20, 20, 255} // #141414  surfaces.container
	ColorElevated   = color.RGBA{31, 31, 31, 255} // #1f1f1f  surfaces.elevated
	ColorBorder     = color.RGBA{42, 42, 42, 255} // #2a2a2a  borders.outline

	// Semantic accents
	ColorPrimary = color.RGBA{255, 144, 108, 255} // #ff906c  orange — driver/primary
	ColorAccent  = color.RGBA{90, 248, 251, 255}  // #5af8fb  cyan — engineer/comparison
	ColorSuccess = color.RGBA{52, 211, 153, 255}  // #34D399
	ColorDanger  = color.RGBA{248, 113, 113, 255} // #F87171
	ColorWarning = color.RGBA{251, 191, 36, 255}  // #FBBF24

	// Text
	ColorForeground = color.RGBA{255, 255, 255, 255} // #ffffff  neutral[100]
	ColorMuted      = color.RGBA{128, 128, 128, 255} // #808080  neutral[400]
	ColorSecondary  = color.RGBA{161, 161, 170, 255} // #A1A1AA  neutral[300]

	// Specialty
	ColorRPMRed = color.RGBA{248, 113, 113, 255} // #F87171  RPM bar >92% zone
)

// DimColor multiplies each RGB channel by factor (0–1).
func DimColor(c color.RGBA, factor float64) color.RGBA {
	return color.RGBA{
		R: uint8(float64(c.R) * factor),
		G: uint8(float64(c.G) * factor),
		B: uint8(float64(c.B) * factor),
		A: c.A,
	}
}

// TyreColor returns the temperature-coded colour for a tyre readout.
func TyreColor(temp float64) color.RGBA {
	switch {
	case temp > 110:
		return ColorDanger
	case temp > 100:
		return ColorWarning
	case temp > 70:
		return ColorSuccess
	case temp > 40:
		return ColorAccent
	default:
		return ColorMuted
	}
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
