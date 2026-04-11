package widgets

import (
	"image/color"
)

// Sprint design tokens — mirroring packages/tokens/src/atoms/colors.ts + molecules/surfaces.ts.
var (
	// Surfaces — matches surfaces.base / container / elevated
	ColBg       = color.RGBA{10, 10, 10, 255} // #0a0a0a  surfaces.base
	ColSurface  = color.RGBA{20, 20, 20, 255} // #141414  surfaces.container
	ColElevated = color.RGBA{31, 31, 31, 255} // #1f1f1f  surfaces.elevated
	// Borders — structural outline #2a2a2a (borders.outline), not semi-transparent white
	ColBorder = color.RGBA{42, 42, 42, 255} // #2a2a2a
	// Accents
	ColAccent  = color.RGBA{255, 144, 108, 255} // #ff906c  orange[500]
	ColTeal    = color.RGBA{90, 248, 251, 255}  // #5af8fb  cyan[500]
	ColSuccess = color.RGBA{52, 211, 153, 255}  // #34D399
	ColDanger  = color.RGBA{248, 113, 113, 255} // #F87171
	ColWarning = color.RGBA{251, 191, 36, 255}  // #FBBF24
	// Text — neutral[100] / neutral[300] / neutral[400]
	ColTextPri   = color.RGBA{255, 255, 255, 255} // #ffffff
	ColTextSec   = color.RGBA{161, 161, 170, 255} // #A1A1AA
	ColTextMuted = color.RGBA{128, 128, 128, 255} // #808080
	// RPM bar zone thresholds  ≤85%→teal  85-92%→orange  >92%→red
	ColRPMOrange = ColAccent
	ColRPMRed    = color.RGBA{220, 38, 38, 255} // #DC2626
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
		return ColDanger
	case temp > 100:
		return ColWarning
	case temp > 70:
		return ColSuccess
	case temp > 40:
		return ColTeal
	default:
		return ColTextMuted
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
