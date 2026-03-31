// Package render paints dashboard images from telemetry data.
// It has no hardware dependency — callers receive an image.Image and decide
// how to deliver it (USB, file, test comparison, etc.).
package render

import (
	"embed"
	"fmt"
	"image"
	"image/color"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/app/internal/dash"
	"github.com/kratofl/sprint/pkg/dto"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
)

//go:embed fonts/*.ttf
var fontsFS embed.FS

// Sprint design tokens — mirroring packages/tokens/src/atoms/colors.ts + molecules/surfaces.ts.
var (
	// Surfaces — matches surfaces.base / container / elevated
	ColBg       = color.RGBA{10, 10, 10, 255}  // #0a0a0a  surfaces.base
	ColSurface  = color.RGBA{20, 20, 20, 255}  // #141414  surfaces.container
	ColElevated = color.RGBA{31, 31, 31, 255}  // #1f1f1f  surfaces.elevated
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

// Painter produces a full dashboard image for a given telemetry frame.
type Painter struct {
	width, height int
	fontDir       string
	fontOnce      sync.Once

	// fontFiles caches parsed *opentype.Font per filename (expensive to parse).
	// fontFaces caches the ready-to-use font.Face per "filename@size" key.
	// Both are only accessed from the render goroutine — no mutex required.
	fontFiles map[string]*opentype.Font
	fontFaces map[string]font.Face

	// bgImg is the pre-baked static background (solid ColBg fill).
	// Rendered once on the first frame; copied into ctx at the start of each
	// frame so clearing the canvas does not run every tick.
	bgImg *image.RGBA

	// ctx is the reusable gg.Context. Allocated once per screen size and reset
	// at the start of each frame by blitting bgImg, avoiding a 1.5 MB allocation
	// per tick (800×480 RGBA).
	ctx *gg.Context

	// layout is the user-configured layout.
	layout atomic.Pointer[dash.DashLayout]
}

// NewPainter creates a Painter for the given screen dimensions.
func NewPainter(width, height int) *Painter {
	return &Painter{width: width, height: height}
}

// SetLayout atomically sets the layout to use on the next rendered frame.
// Passing nil is a no-op (the caller should always pass a valid layout).
func (p *Painter) SetLayout(layout *dash.DashLayout) {
	if layout == nil {
		p.layout.Store((*dash.DashLayout)(nil))
	} else {
		p.layout.Store(layout)
	}
}

// Paint renders a complete dashboard image for the given telemetry frame
// using the active layout.
func (p *Painter) Paint(frame *dto.TelemetryFrame) (image.Image, error) {
	p.fontOnce.Do(func() {
		p.extractFonts()
		p.fontFiles = make(map[string]*opentype.Font)
		p.fontFaces = make(map[string]font.Face)
	})
	p.ensureBg()

	w, h := float64(p.width), float64(p.height)
	dc := p.getContext()

	if layout := p.layout.Load(); layout != nil {
		for _, widget := range layout.Widgets {
			p.dispatchWidget(dc, frame, widget)
		}
	}

	p.applyFlagOverlay(dc, frame, w, h)
	return dc.Image(), nil
}

// dispatchWidget dispatches to the registered widget renderer for w.Type.
// Unknown widget types are silently skipped.
func (p *Painter) dispatchWidget(dc *gg.Context, frame *dto.TelemetryFrame, w dash.DashWidget) {
	fn, ok := widgetRegistry[w.Type]
	if !ok {
		return
	}
	fn(WidgetCtx{
		DC:    dc,
		Frame: frame,
		X:     float64(w.X),
		Y:     float64(w.Y),
		W:     float64(w.W),
		H:     float64(w.H),
		p:     p,
	})
}

// applyFlagOverlay draws the flag status banner over the rendered frame when a flag is active.
func (p *Painter) applyFlagOverlay(dc *gg.Context, frame *dto.TelemetryFrame, w, h float64) {
	if !frame.Flags.Yellow && !frame.Flags.Red && !frame.Flags.SafetyCar {
		return
	}
	var flagCol color.RGBA
	var flagText string
	switch {
	case frame.Flags.Red:
		flagCol, flagText = ColDanger, "RED FLAG"
	case frame.Flags.SafetyCar:
		flagCol, flagText = ColWarning, "SAFETY CAR"
	default:
		flagCol, flagText = ColWarning, "YELLOW FLAG"
	}
	dc.SetRGBA255(int(flagCol.R), int(flagCol.G), int(flagCol.B), 25)
	dc.DrawRectangle(0, 0, w, h)
	dc.Fill()
	dc.SetColor(flagCol)
	dc.DrawRectangle(0, h-30, w, 30)
	dc.Fill()
	p.face(dc, "SpaceGrotesk-Bold.ttf", 14)
	dc.SetColor(ColBg)
	dc.DrawStringAnchored(flagText, w/2, h-15, 0.5, 0.5)
}

// ── drawing helpers ──────────────────────────────────────────────────────────

// ensureBg pre-renders the static background into bgImg once per painter
// lifetime. Subsequent frames blit this image instead of clearing manually.
func (p *Painter) ensureBg() {
	if p.bgImg != nil {
		return
	}
	tmp := gg.NewContext(p.width, p.height)
	tmp.SetColor(ColBg)
	tmp.Clear()
	src := tmp.Image().(*image.RGBA)
	p.bgImg = image.NewRGBA(src.Rect)
	copy(p.bgImg.Pix, src.Pix)
}

// getContext returns the reusable gg.Context reset to the pre-baked background.
// The same *image.RGBA is reused across frames: the caller converts it to
// RGB565 immediately after Paint returns, so reuse is safe.
func (p *Painter) getContext() *gg.Context {
	if p.ctx == nil {
		p.ctx = gg.NewContext(p.width, p.height)
	}
	if dst, ok := p.ctx.Image().(*image.RGBA); ok && p.bgImg != nil {
		copy(dst.Pix, p.bgImg.Pix)
	} else {
		p.ctx.SetColor(ColBg)
		p.ctx.Clear()
	}
	return p.ctx
}

func drawPanel(dc *gg.Context, x, y, w, h, r float64) {
	dc.SetColor(ColElevated)
	dc.DrawRoundedRectangle(x, y, w, h, r)
	dc.Fill()
	dc.SetColor(ColBorder)
	dc.SetLineWidth(1)
	dc.DrawRoundedRectangle(x, y, w, h, r)
	dc.Stroke()
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

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
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

// FmtLap formats t (seconds) as "M:SS.mmm". Returns "-.---.---" when t ≤ 0.
func FmtLap(seconds float64) string {
	if seconds <= 0 {
		return "-.---.---"
	}
	m := int(seconds) / 60
	s := seconds - float64(m*60)
	return fmt.Sprintf("%d:%06.3f", m, s)
}

// FmtSector formats t (seconds) as "SS.mmm". Returns "--.---" when t ≤ 0.
func FmtSector(seconds float64) string {
	if seconds <= 0 {
		return "--.---"
	}
	return fmt.Sprintf("%.3f", seconds)
}

// Close removes the temporary font directory and releases cached font faces.
// Safe to call multiple times.
func (p *Painter) Close() {
	if p.fontDir != "" {
		os.RemoveAll(p.fontDir)
		p.fontDir = ""
	}
	for _, f := range p.fontFaces {
		f.Close()
	}
	p.fontFaces = nil
	p.fontFiles = nil
}

// ── font management ──────────────────────────────────────────────────────────

// face sets the font face on dc, using a cache to avoid re-parsing the TTF on
// every draw call.
func (p *Painter) face(dc *gg.Context, name string, size float64) {
	key := fmt.Sprintf("%s@%.2f", name, size)
	if f, ok := p.fontFaces[key]; ok {
		dc.SetFontFace(f)
		return
	}

	parsed, ok := p.fontFiles[name]
	if !ok {
		data, err := os.ReadFile(filepath.Join(p.fontDir, name))
		if err != nil {
			return
		}
		parsed, err = opentype.Parse(data)
		if err != nil {
			return
		}
		p.fontFiles[name] = parsed
	}

	face, err := opentype.NewFace(parsed, &opentype.FaceOptions{
		Size:    size,
		DPI:     72,
		Hinting: font.HintingFull,
	})
	if err != nil {
		return
	}
	p.fontFaces[key] = face
	dc.SetFontFace(face)
}

func (p *Painter) extractFonts() {
	dir, err := os.MkdirTemp("", "sprint-fonts-*")
	if err != nil {
		return
	}
	p.fontDir = dir
	entries, _ := fontsFS.ReadDir("fonts")
	for _, e := range entries {
		data, err := fontsFS.ReadFile("fonts/" + e.Name())
		if err != nil {
			continue
		}
		_ = os.WriteFile(filepath.Join(dir, e.Name()), data, 0644)
	}
}
