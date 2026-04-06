package widgets

import (
	"image/color"

	"github.com/fogleman/gg"
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

func drawPanel(dc *gg.Context, x, y, w, h, r, bw float64) {
	// Draw border as an outer fill, then cover the interior with the background.
	// Using two fills (no Stroke) avoids the 1px stroke overhang that extends
	// outside the widget bounds and causes border flickering on isolated widgets.
	dc.SetColor(ColBorder)
	dc.DrawRoundedRectangle(x, y, w, h, r)
	dc.Fill()
	dc.SetColor(ColBg)
	dc.DrawRoundedRectangle(x+bw, y+bw, w-bw*2, h-bw*2, r)
	dc.Fill()
}

func drawHBar(dc *gg.Context, x, y, w, h, pct float64, col color.RGBA) {
	pct = clamp01(pct)
	dc.SetColor(DimColor(col, 0.15))
	dc.DrawRoundedRectangle(x, y, w, h, 3)
	dc.Fill()
	if pct > 0 {
		dc.SetColor(col)
		dc.DrawRoundedRectangle(x, y, w*pct, h, 3)
		dc.Fill()
	}
}

// drawHBarCentered draws a horizontal bar where 0.5 is the centre position.
// Values < 0.5 fill left of centre, values > 0.5 fill right of centre.
// Used for steering input, where -1…+1 is normalised to 0…1.
func drawHBarCentered(dc *gg.Context, x, y, w, h, pct float64, col color.RGBA) {
	pct = clamp01(pct)
	dc.SetColor(DimColor(col, 0.15))
	dc.DrawRoundedRectangle(x, y, w, h, 3)
	dc.Fill()
	dc.SetColor(DimColor(col, 0.4))
	dc.DrawRectangle(x+w/2-0.5, y, 1, h)
	dc.Fill()
	if pct != 0.5 {
		dc.SetColor(col)
		if pct < 0.5 {
			fillW := (0.5 - pct) * w
			dc.DrawRoundedRectangle(x+pct*w, y, fillW, h, 3)
		} else {
			fillW := (pct - 0.5) * w
			dc.DrawRoundedRectangle(x+w*0.5, y, fillW, h, 3)
		}
		dc.Fill()
	}
}
