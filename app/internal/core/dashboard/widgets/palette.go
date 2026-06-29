package widgets

import (
	"image/color"
)

// FixedCanvasBackground is the fixed-background contract for the on-wheel dashboard
// renderer: the canvas and every standard widget surface are painted opaque #000000.
// This is intentionally NOT theme-driven — themes resolve accent/status/RPM/domain
// colours only and can never reintroduce an elevated or tinted surface here. The one
// sanctioned exception is an explicit per-widget WidgetStyle.Background override.
// "Pure black" means #000000, not the desktop Surface/Screen token. (PRD #106, #12/#46.)
var FixedCanvasBackground = color.RGBA{0, 0, 0, 255}

// Sprint design-system palette — mirrors the flat Figma theme tokens.
var (
	// Surfaces
	ColorBackground = color.RGBA{9, 9, 7, 255}      // #090907  surfaces.base
	ColorSurface    = color.RGBA{18, 17, 15, 255}   // #12110f  surfaces.container
	ColorElevated   = color.RGBA{26, 24, 21, 255}   // #1a1815  surfaces.elevated
	ColorBorder     = color.RGBA{111, 103, 95, 255} // #6f675f  strong Figma outline
	// ColorInstrumentOutline is the fine hairline used to frame on-wheel widgets on
	// pure black — deliberately subtle so the dashboard reads as composed instruments,
	// not a grid of hard boxes (PRD #106 #6).
	ColorInstrumentOutline = color.RGBA{48, 46, 43, 255} // #302e2b

	// Semantic accents
	ColorPrimary = color.RGBA{255, 144, 108, 255} // #ff906c  orange — driver/primary
	ColorAccent  = color.RGBA{79, 156, 255, 255} // #4F9CFF  blue — engineer/comparison
	ColorSuccess = color.RGBA{52, 211, 153, 255}  // #34D399
	ColorDanger  = color.RGBA{255, 59, 48, 255}   // #ff3b30
	ColorWarning = color.RGBA{251, 191, 36, 255}  // #FBBF24

	// Text
	ColorForeground = color.RGBA{246, 240, 230, 255} // #f6f0e6
	ColorMuted      = color.RGBA{169, 160, 149, 255} // #a9a095
	ColorSecondary  = color.RGBA{200, 191, 178, 255} // #c8bfb2

	// Specialty
	ColorRPMRed = color.RGBA{255, 59, 48, 255} // #ff3b30  RPM bar >92% zone
)

// ContrastForeground returns black or white — whichever reads better on top of
// bg. Used by alert "normal" mode to pick a legible foreground over the semantic
// fill colour. Uses the standard perceptual luminance weighting.
func ContrastForeground(bg color.RGBA) color.RGBA {
	luminance := 0.299*float64(bg.R) + 0.587*float64(bg.G) + 0.114*float64(bg.B)
	if luminance > 140 {
		return color.RGBA{R: 0, G: 0, B: 0, A: 255}
	}
	return color.RGBA{R: 255, G: 255, B: 255, A: 255}
}

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
