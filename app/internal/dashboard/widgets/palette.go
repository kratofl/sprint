package widgets

import (
	"image/color"
)

// Sprint design-system palette — mirrors packages/tokens/src/atoms/colors.ts + molecules/surfaces.ts.
var (
	// Surfaces
	ColorBackground = color.RGBA{9, 10, 12, 255}  // #090a0c  surfaces.base
	ColorSurface    = color.RGBA{21, 23, 28, 255} // #15171c  surfaces.container
	ColorElevated   = color.RGBA{31, 35, 41, 255} // #1f2329  surfaces.elevated
	ColorBorder     = color.RGBA{45, 49, 56, 255} // #2d3138  borders.outline

	// Semantic accents
	ColorPrimary = color.RGBA{255, 139, 97, 255}  // #ff8b61  orange — driver/primary
	ColorAccent  = color.RGBA{121, 214, 230, 255} // #79d6e6  teal — engineer/comparison
	ColorSuccess = color.RGBA{79, 209, 155, 255}  // #4FD19B
	ColorDanger  = color.RGBA{240, 125, 125, 255} // #F07D7D
	ColorWarning = color.RGBA{242, 184, 75, 255}  // #F2B84B

	// Text
	ColorForeground = color.RGBA{245, 247, 250, 255} // #f5f7fa  neutral[100]
	ColorMuted      = color.RGBA{139, 147, 161, 255} // #8b93a1  neutral[400]
	ColorSecondary  = color.RGBA{183, 191, 202, 255} // #b7bfca  neutral[300]

	// Specialty
	ColorRPMRed = color.RGBA{230, 74, 74, 255} // #E64A4A  RPM bar >92% zone
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
