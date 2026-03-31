package vocore

import (
	"embed"
	"fmt"
	"image"
	"image/color"
	"math"
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
	colBg       = color.RGBA{10, 10, 10, 255} // #0a0a0a  surfaces.base
	colSurface  = color.RGBA{20, 20, 20, 255} // #141414  surfaces.container
	colElevated = color.RGBA{31, 31, 31, 255} // #1f1f1f  surfaces.elevated
	// Borders — structural outline #2a2a2a (borders.outline), not semi-transparent white
	colBorder = color.RGBA{42, 42, 42, 255} // #2a2a2a
	// Accents
	colAccent  = color.RGBA{255, 144, 108, 255} // #ff906c  orange[500]
	colTeal    = color.RGBA{90, 248, 251, 255}  // #5af8fb  cyan[500]
	colSuccess = color.RGBA{52, 211, 153, 255}  // #34D399
	colDanger  = color.RGBA{248, 113, 113, 255} // #F87171
	colWarning = color.RGBA{251, 191, 36, 255}  // #FBBF24
	// Text — neutral[100] / neutral[300] / neutral[400]
	colTextPri   = color.RGBA{255, 255, 255, 255} // #ffffff
	colTextSec   = color.RGBA{161, 161, 170, 255} // #A1A1AA
	colTextMuted = color.RGBA{128, 128, 128, 255} // #808080
	// RPM bar zone thresholds  ≤85%→teal  85-92%→orange  >92%→red
	colRPMOrange = colAccent
	colRPMRed    = color.RGBA{220, 38, 38, 255} // #DC2626
)

// DashRenderer produces a full dashboard image for a given telemetry frame.
type DashRenderer struct {
	width, height int
	fontDir       string
	fontOnce      sync.Once

	// fontFiles caches parsed *opentype.Font per filename (expensive to parse).
	// fontFaces caches the ready-to-use font.Face per "filename@size" key.
	// Both are only accessed from the render goroutine — no mutex required.
	fontFiles map[string]*opentype.Font
	fontFaces map[string]font.Face

	// bgImg is the pre-baked static background (solid colBg fill).
	// Rendered once on the first frame; copied into ctx at the start of each
	// frame so clearing the canvas does not run every tick.
	bgImg *image.RGBA

	// ctx is the reusable gg.Context. Allocated once per screen size and reset
	// at the start of each frame by blitting bgImg, avoiding a 1.5 MB allocation
	// per tick (800×480 RGBA).
	ctx *gg.Context

	// layout is the user-configured layout; nil means use the hardcoded default.
	layout atomic.Pointer[dash.DashLayout]
}

// NewDashRenderer creates a renderer for the given screen dimensions.
func NewDashRenderer(width, height int) *DashRenderer {
	return &DashRenderer{width: width, height: height}
}

// SetLayout atomically sets the layout to use on the next rendered frame.
// Passing nil reverts to the hardcoded default layout.
func (dr *DashRenderer) SetLayout(layout *dash.DashLayout) {
	// atomic.Pointer stores a pointer; nil is stored as-is.
	if layout == nil {
		dr.layout.Store((*dash.DashLayout)(nil))
	} else {
		dr.layout.Store(layout)
	}
}

// RenderFrame renders a complete dashboard image for the given telemetry frame.
// If a custom layout has been set via SetLayout, it is used; otherwise the
// built-in default layout is rendered.
func (dr *DashRenderer) RenderFrame(frame *dto.TelemetryFrame) (image.Image, error) {
	dr.fontOnce.Do(func() {
		dr.extractFonts()
		dr.fontFiles = make(map[string]*opentype.Font)
		dr.fontFaces = make(map[string]font.Face)
	})
	dr.ensureBg()

	if layout := dr.layout.Load(); layout != nil {
		return dr.renderCustomLayout(frame, layout)
	}
	return dr.renderDefaultLayout(frame)
}

// renderCustomLayout renders the user-defined widget layout.
func (dr *DashRenderer) renderCustomLayout(frame *dto.TelemetryFrame, layout *dash.DashLayout) (image.Image, error) {
	w, h := float64(dr.width), float64(dr.height)
	dc := dr.getContext()

	for _, widget := range layout.Widgets {
		dr.renderWidget(dc, frame, widget)
	}

	dr.applyFlagOverlay(dc, frame, w, h)
	return dc.Image(), nil
}

// renderWidget dispatches to the registered widget renderer for w.Type.
// Each widget renderer is responsible for drawing its own panel via c.Panel().
// Unknown widget types are silently skipped.
func (dr *DashRenderer) renderWidget(dc *gg.Context, frame *dto.TelemetryFrame, w dash.DashWidget) {
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
		dr:    dr,
	})
}

// renderDefaultLayout renders the built-in hardcoded dashboard layout.
// It draws a header bar with session info (not a widget — unique per-session
// context), then dispatches every content widget through the shared registry,
// using the same code path as a user-configured custom layout.
func (dr *DashRenderer) renderDefaultLayout(frame *dto.TelemetryFrame) (image.Image, error) {
	w, h := float64(dr.width), float64(dr.height)
	dc := dr.getContext()

	// ── Header (session info — not a widget) ─────────────────────────────
	hdrH := 38.0
	drawPanel(dc, 8, 6, w-16, hdrH, 8)

	dr.face(dc, "SpaceGrotesk-Bold.ttf", 13)
	dc.SetColor(colTextMuted)
	dc.DrawStringAnchored("SPRINT", 24, 6+hdrH/2, 0, 0.5)

	dr.face(dc, "SpaceGrotesk-Regular.ttf", 12)
	dc.SetColor(colTextPri)
	dc.DrawStringAnchored(frame.Session.Track, 108, 6+hdrH/2, 0, 0.5)
	dc.SetColor(colTextSec)
	dc.DrawStringAnchored(frame.Session.Car, 290, 6+hdrH/2, 0, 0.5)
	dc.DrawStringAnchored(string(frame.Session.SessionType), 500, 6+hdrH/2, 0, 0.5)

	dr.face(dc, "JetBrainsMono-Regular.ttf", 12)
	dc.SetColor(colTextMuted)
	dc.DrawStringAnchored(fmt.Sprintf("L%d", frame.Lap.CurrentLap), w-80, 6+hdrH/2, 0, 0.5)
	dc.SetColor(colTeal)
	dc.DrawCircle(w-30, 6+hdrH/2, 4)
	dc.Fill()
	dr.face(dc, "SpaceGrotesk-Regular.ttf", 10)
	dc.DrawStringAnchored("LIVE", w-18, 6+hdrH/2, 0, 0.5)

	// ── Content widgets ───────────────────────────────────────────────────
	topY := hdrH + 14.0
	pad := 8.0
	ch := h - topY - pad // usable content height

	rpmW := 40.0
	leftW := 340.0
	cx := pad + rpmW + pad   // center column X
	cw := leftW - rpmW - pad // center column W
	rx := pad + leftW + pad  // right column X
	rw := w - rx - pad       // right column W

	gearH := ch * 0.52
	inputH := ch*0.28 - 4
	sectorH := math.Max(24, ch-gearH-pad-inputH-pad-pad)

	lapH := ch * 0.42
	lapTimeH := lapH * 0.75
	deltaH := lapH - lapTimeH - pad
	fuelH := ch*0.28 - 4
	tyreH := math.Max(40, ch-lapH-pad-fuelH-pad-pad)

	ri := func(v float64) int { return int(math.Round(v)) }

	for _, wd := range []dash.DashWidget{
		{Type: dash.WidgetRPMBar,     X: ri(pad), Y: ri(topY),                               W: ri(rpmW), H: ri(ch)},
		{Type: dash.WidgetGearSpeed,  X: ri(cx),  Y: ri(topY),                               W: ri(cw),   H: ri(gearH)},
		{Type: dash.WidgetInputTrace, X: ri(cx),  Y: ri(topY + gearH + pad),                 W: ri(cw),   H: ri(inputH)},
		{Type: dash.WidgetSector,     X: ri(cx),  Y: ri(topY + gearH + pad + inputH + pad),  W: ri(cw),   H: ri(sectorH)},
		{Type: dash.WidgetLapTime,    X: ri(rx),  Y: ri(topY),                               W: ri(rw),   H: ri(lapTimeH)},
		{Type: dash.WidgetDelta,      X: ri(rx),  Y: ri(topY + lapTimeH + pad),              W: ri(rw),   H: ri(deltaH)},
		{Type: dash.WidgetFuel,       X: ri(rx),  Y: ri(topY + lapH + pad),                  W: ri(rw),   H: ri(fuelH)},
		{Type: dash.WidgetTyreTemp,   X: ri(rx),  Y: ri(topY + lapH + pad + fuelH + pad),    W: ri(rw),   H: ri(tyreH)},
	} {
		dr.renderWidget(dc, frame, wd)
	}

	dr.applyFlagOverlay(dc, frame, w, h)
	return dc.Image(), nil
}

// applyFlagOverlay draws the flag status banner over the rendered frame when a flag is active.
func (dr *DashRenderer) applyFlagOverlay(dc *gg.Context, frame *dto.TelemetryFrame, w, h float64) {
	if !frame.Flags.Yellow && !frame.Flags.Red && !frame.Flags.SafetyCar {
		return
	}
	var flagCol color.RGBA
	var flagText string
	switch {
	case frame.Flags.Red:
		flagCol, flagText = colDanger, "RED FLAG"
	case frame.Flags.SafetyCar:
		flagCol, flagText = colWarning, "SAFETY CAR"
	default:
		flagCol, flagText = colWarning, "YELLOW FLAG"
	}
	dc.SetRGBA255(int(flagCol.R), int(flagCol.G), int(flagCol.B), 25)
	dc.DrawRectangle(0, 0, w, h)
	dc.Fill()
	dc.SetColor(flagCol)
	dc.DrawRectangle(0, h-30, w, 30)
	dc.Fill()
	dr.face(dc, "SpaceGrotesk-Bold.ttf", 14)
	dc.SetColor(colBg)
	dc.DrawStringAnchored(flagText, w/2, h-15, 0.5, 0.5)
}

// ── drawing helpers ──────────────────────────────────────────────────────────

// ensureBg pre-renders the static background into bgImg once per renderer
// lifetime. Subsequent frames blit this image instead of clearing manually.
func (dr *DashRenderer) ensureBg() {
	if dr.bgImg != nil {
		return
	}
	tmp := gg.NewContext(dr.width, dr.height)
	tmp.SetColor(colBg)
	tmp.Clear()
	src := tmp.Image().(*image.RGBA)
	dr.bgImg = image.NewRGBA(src.Rect)
	copy(dr.bgImg.Pix, src.Pix)
}

// getContext returns the reusable gg.Context reset to the pre-baked background.
// The same *image.RGBA is reused across frames: the render goroutine converts it
// to RGB565 immediately after RenderFrame returns, so reuse is safe.
func (dr *DashRenderer) getContext() *gg.Context {
	if dr.ctx == nil {
		dr.ctx = gg.NewContext(dr.width, dr.height)
	}
	if dst, ok := dr.ctx.Image().(*image.RGBA); ok && dr.bgImg != nil {
		copy(dst.Pix, dr.bgImg.Pix)
	} else {
		dr.ctx.SetColor(colBg)
		dr.ctx.Clear()
	}
	return dr.ctx
}

func drawPanel(dc *gg.Context, x, y, w, h, r float64) {
	// Use elevated surface (#1f1f1f) so panels visually stand out from the
	// dark page background (#0a0a0a). Border is solid #2a2a2a (structural outline).
	dc.SetColor(colElevated)
	dc.DrawRoundedRectangle(x, y, w, h, r)
	dc.Fill()
	dc.SetColor(colBorder)
	dc.SetLineWidth(1)
	dc.DrawRoundedRectangle(x, y, w, h, r)
	dc.Stroke()
}

func drawHBar(dc *gg.Context, x, y, w, h, pct float64, col color.RGBA) {
	pct = clamp01(pct)
	dc.SetColor(dimColor(col, 0.15))
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
	dc.SetColor(dimColor(col, 0.15))
	dc.DrawRoundedRectangle(x, y, w, h, 3)
	dc.Fill()
	// Draw a thin centre marker.
	dc.SetColor(dimColor(col, 0.4))
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

func dimColor(c color.RGBA, factor float64) color.RGBA {
	return color.RGBA{
		R: uint8(float64(c.R) * factor),
		G: uint8(float64(c.G) * factor),
		B: uint8(float64(c.B) * factor),
		A: c.A,
	}
}

func tyreColor(temp float64) color.RGBA {
	switch {
	case temp > 110:
		return colDanger
	case temp > 100:
		return colWarning
	case temp > 70:
		return colSuccess
	case temp > 40:
		return colTeal
	default:
		return colTextMuted
	}
}

func fmtLap(seconds float64) string {
	if seconds <= 0 {
		return "-.---.---"
	}
	m := int(seconds) / 60
	s := seconds - float64(m*60)
	return fmt.Sprintf("%d:%06.3f", m, s)
}

func fmtSector(seconds float64) string {
	if seconds <= 0 {
		return "--.---"
	}
	return fmt.Sprintf("%.3f", seconds)
}

// Close removes the temporary font directory and releases cached font faces.
// Safe to call multiple times.
func (dr *DashRenderer) Close() {
	if dr.fontDir != "" {
		os.RemoveAll(dr.fontDir)
		dr.fontDir = ""
	}
	for _, f := range dr.fontFaces {
		f.Close()
	}
	dr.fontFaces = nil
	dr.fontFiles = nil
}

// ── font management ──────────────────────────────────────────────────────────

// face sets the font face on dc, using a cache to avoid re-parsing the TTF on
// every draw call. Fonts are parsed once per filename; faces are created once
// per (filename, size) pair and reused across all subsequent frames.
func (dr *DashRenderer) face(dc *gg.Context, name string, size float64) {
	key := fmt.Sprintf("%s@%.2f", name, size)
	if f, ok := dr.fontFaces[key]; ok {
		dc.SetFontFace(f)
		return
	}

	// Parse the font file once per filename.
	parsed, ok := dr.fontFiles[name]
	if !ok {
		data, err := os.ReadFile(filepath.Join(dr.fontDir, name))
		if err != nil {
			return
		}
		parsed, err = opentype.Parse(data)
		if err != nil {
			return
		}
		dr.fontFiles[name] = parsed
	}

	face, err := opentype.NewFace(parsed, &opentype.FaceOptions{
		Size:    size,
		DPI:     72,
		Hinting: font.HintingFull,
	})
	if err != nil {
		return
	}
	dr.fontFaces[key] = face
	dc.SetFontFace(face)
}

func (dr *DashRenderer) extractFonts() {
	dir, err := os.MkdirTemp("", "sprint-fonts-*")
	if err != nil {
		return
	}
	dr.fontDir = dir
	entries, _ := fontsFS.ReadDir("fonts")
	for _, e := range entries {
		data, err := fontsFS.ReadFile("fonts/" + e.Name())
		if err != nil {
			continue
		}
		_ = os.WriteFile(filepath.Join(dir, e.Name()), data, 0644)
	}
}
