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
	colBg       = color.RGBA{10, 10, 10, 255}  // #0a0a0a  surfaces.base
	colSurface  = color.RGBA{20, 20, 20, 255}  // #141414  surfaces.container
	colElevated = color.RGBA{31, 31, 31, 255}  // #1f1f1f  surfaces.elevated
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

	// bgImg is the pre-baked static background: bg fill + orange glow ellipses.
	// Rendered once on the first frame; copied into ctx at the start of each frame
	// so the 80-iteration glow loop does not run every tick.
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

// renderWidget draws a single DashWidget inside its bounding box.
func (dr *DashRenderer) renderWidget(dc *gg.Context, frame *dto.TelemetryFrame, w dash.DashWidget) {
	x, y, ww, wh := float64(w.X), float64(w.Y), float64(w.W), float64(w.H)

	// WidgetInputTrace draws its own panel (contains multiple sub-elements).
	if w.Type != dash.WidgetInputTrace {
		drawPanel(dc, x, y, ww, wh, 8)
	}

	switch w.Type {
	case dash.WidgetGear:
		dr.drawWidgetGear(dc, frame, x, y, ww, wh)
	case dash.WidgetSpeed:
		dr.drawWidgetSpeed(dc, frame, x, y, ww, wh)
	case dash.WidgetRPMBar:
		dr.drawWidgetRPMBar(dc, frame, x, y, ww, wh)
	case dash.WidgetLapTime:
		dr.drawWidgetLapTime(dc, frame, x, y, ww, wh)
	case dash.WidgetDelta:
		dr.drawWidgetDelta(dc, frame, x, y, ww, wh)
	case dash.WidgetSector:
		dr.drawWidgetSector(dc, frame, x, y, ww, wh)
	case dash.WidgetFuel:
		dr.drawWidgetFuel(dc, frame, x, y, ww, wh)
	case dash.WidgetTyreTemp:
		dr.drawWidgetTyreTemp(dc, frame, x, y, ww, wh)
	case dash.WidgetInputTrace:
		dr.drawWidgetInputTrace(dc, frame, x, y, ww, wh)
	}
}

func (dr *DashRenderer) drawWidgetGear(dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64) {
	gear := frame.Car.Gear
	gearStr := "N"
	if gear > 0 {
		gearStr = fmt.Sprintf("%d", gear)
	} else if gear < 0 {
		gearStr = "R"
	}
	dr.face(dc, "JetBrainsMono-Bold.ttf", h*0.7)
	dc.SetColor(colTextPri)
	dc.DrawStringAnchored(gearStr, x+w/2, y+h*0.45, 0.5, 0.5)
}

func (dr *DashRenderer) drawWidgetSpeed(dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64) {
	speed := float64(frame.Car.SpeedMS) * 3.6
	dr.face(dc, "JetBrainsMono-Bold.ttf", h*0.45)
	dc.SetColor(colTextPri)
	dc.DrawStringAnchored(fmt.Sprintf("%.0f", speed), x+w/2, y+h*0.4, 0.5, 0.5)
	dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.18)
	dc.SetColor(colTextMuted)
	dc.DrawStringAnchored("km/h", x+w/2, y+h*0.72, 0.5, 0.5)
}

func (dr *DashRenderer) drawWidgetRPMBar(dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64) {
	rpmPct := clamp01(float64(frame.Car.RPM) / float64(frame.Car.MaxRPM))
	segs := 20
	segH := (h - 12) / float64(segs)
	filled := int(float64(segs) * rpmPct)
	for i := 0; i < segs; i++ {
		sy := y + 6 + (h - 12) - float64(i+1)*segH
		pct := float64(i) / float64(segs)
		col := colTeal
		if pct > 0.92 {
			col = colRPMRed
		} else if pct > 0.85 {
			col = colRPMOrange
		}
		if i >= filled {
			col = dimColor(col, 0.15)
		}
		dc.SetColor(col)
		dc.DrawRoundedRectangle(x+5, sy+1, w-10, segH-2, 2)
		dc.Fill()
	}
}

func (dr *DashRenderer) drawWidgetLapTime(dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64) {
	type lapEntry struct {
		label string
		time  float64
		col   color.RGBA
	}
	laps := []lapEntry{
		{"Current", frame.Lap.CurrentLapTime, colTextPri},
		{"Last", frame.Lap.LastLapTime, colTextPri},
		{"Best", frame.Lap.BestLapTime, colTeal},
	}
	dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.1)
	dc.SetColor(colTextMuted)
	dc.DrawString("LAP TIMES", x+12, y+h*0.15)
	for i, l := range laps {
		ly := y + h*0.25 + float64(i)*(h*0.22)
		dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.12)
		dc.SetColor(colTextSec)
		dc.DrawString(l.label, x+12, ly)
		dr.face(dc, "JetBrainsMono-Bold.ttf", h*0.16)
		dc.SetColor(l.col)
		dc.DrawStringAnchored(fmtLap(l.time), x+w-12, ly-4, 1, 0)
	}
}

func (dr *DashRenderer) drawWidgetDelta(dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64) {
	if frame.Lap.TargetLapTime <= 0 {
		dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.15)
		dc.SetColor(colTextMuted)
		dc.DrawStringAnchored("No target", x+w/2, y+h/2, 0.5, 0.5)
		return
	}
	delta := frame.Lap.CurrentLapTime - frame.Lap.TargetLapTime
	dbh := h * 0.3
	dby := y + h*0.4
	dbw := w - 24
	dc.SetColor(colSurface)
	dc.DrawRoundedRectangle(x+12, dby, dbw, dbh, 3)
	dc.Fill()

	maxD := 2.0
	pct := math.Max(-1, math.Min(1, delta/maxD))
	mid := x + 12 + dbw/2
	fw := math.Abs(pct) * dbw / 2
	if delta > 0 {
		dc.SetColor(colDanger)
		dc.DrawRoundedRectangle(mid, dby+1, fw, dbh-2, 2)
	} else {
		dc.SetColor(colTeal)
		dc.DrawRoundedRectangle(mid-fw, dby+1, fw, dbh-2, 2)
	}
	dc.Fill()

	sign, col := "+", colDanger
	if delta < 0 {
		sign, col = "-", colTeal
	}
	dr.face(dc, "JetBrainsMono-Bold.ttf", h*0.18)
	dc.SetColor(col)
	dc.DrawStringAnchored(fmt.Sprintf("%s%.3f", sign, math.Abs(delta)), x+w/2, dby+dbh+h*0.15, 0.5, 0.5)
}

func (dr *DashRenderer) drawWidgetSector(dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64) {
	dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.12)
	dc.SetColor(colTextMuted)
	dc.DrawString("SECTORS", x+12, y+h*0.2)

	sw := (w - 36) / 3
	for i, st := range []float64{frame.Lap.Sector1Time, frame.Lap.Sector2Time} {
		sx := x + 12 + float64(i)*sw
		dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.12)
		dc.SetColor(colTextMuted)
		dc.DrawString(fmt.Sprintf("S%d", i+1), sx, y+h*0.5)
		dr.face(dc, "JetBrainsMono-Regular.ttf", h*0.22)
		dc.SetColor(colTextPri)
		dc.DrawString(fmtSector(st), sx, y+h*0.78)
	}
	dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.12)
	dc.SetColor(colAccent)
	dc.DrawString(fmt.Sprintf("S%d ●", frame.Lap.Sector), x+12+2*sw, y+h*0.5)
}

func (dr *DashRenderer) drawWidgetFuel(dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64) {
	dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.12)
	dc.SetColor(colTextMuted)
	dc.DrawString("FUEL", x+12, y+h*0.22)
	dr.face(dc, "JetBrainsMono-Bold.ttf", h*0.32)
	dc.SetColor(colTextPri)
	dc.DrawString(fmt.Sprintf("%.1f L", frame.Car.Fuel), x+12, y+h*0.58)
	dr.face(dc, "JetBrainsMono-Regular.ttf", h*0.16)
	dc.SetColor(colTextSec)
	dc.DrawStringAnchored(fmt.Sprintf("%.2f L/lap", frame.Car.FuelPerLap), x+w-12, y+h*0.56, 1, 0)
	if frame.Car.FuelPerLap > 0 {
		rem := float64(frame.Car.Fuel) / float64(frame.Car.FuelPerLap)
		dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.14)
		dc.SetColor(colTextMuted)
		dc.DrawString(fmt.Sprintf("~%.0f laps", rem), x+12, y+h-10)
	}
}

func (dr *DashRenderer) drawWidgetTyreTemp(dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64) {
	dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.1)
	dc.SetColor(colTextMuted)
	dc.DrawString("TYRE TEMPS", x+12, y+h*0.18)
	tireLabels := [4]string{"FL", "FR", "RL", "RR"}
	tw := (w - 36) / 2
	for i, tire := range frame.Tires {
		col := i % 2
		row := i / 2
		tx := x + 12 + float64(col)*(tw+12)
		ty := y + h*0.3 + float64(row)*(h*0.32)
		avgTemp := (float64(tire.TempInner) + float64(tire.TempMiddle) + float64(tire.TempOuter)) / 3
		dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.12)
		dc.SetColor(colTextMuted)
		dc.DrawString(tireLabels[i], tx, ty)
		dr.face(dc, "JetBrainsMono-Bold.ttf", h*0.2)
		dc.SetColor(tyreColor(avgTemp))
		dc.DrawStringAnchored(fmt.Sprintf("%.0f°", avgTemp), tx+tw, ty-2, 1, 0)
	}
}

func (dr *DashRenderer) drawWidgetInputTrace(dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64) {
	drawPanel(dc, x, y, w, h, 8)
	dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.08)
	dc.SetColor(colTextMuted)
	dc.DrawString("INPUTS", x+10, y+h*0.14)

	barX := x + 52.0
	barW := w - 62.0
	barH := h * 0.12
	rowH := h / 4

	type inputRow struct {
		label string
		value float64
		col   color.RGBA
	}
	steerNorm := (float64(frame.Car.Steering) + 1.0) / 2.0
	rows := []inputRow{
		{"THR", float64(frame.Car.Throttle), colSuccess},
		{"BRK", float64(frame.Car.Brake), colDanger},
		{"CLU", float64(frame.Car.Clutch), colTextSec},
		{"STR", steerNorm, colTextSec},
	}
	for i, row := range rows {
		cy := y + rowH*(float64(i)+0.5)
		dr.face(dc, "SpaceGrotesk-Regular.ttf", h*0.09)
		dc.SetColor(colTextMuted)
		dc.DrawStringAnchored(row.label, x+34, cy, 1, 0.5)
		if i == 3 {
			drawHBarCentered(dc, barX, cy-barH/2, barW, barH, row.value, row.col)
		} else {
			drawHBar(dc, barX, cy-barH/2, barW, barH, row.value, row.col)
		}
	}
}

// renderDefaultLayout renders the built-in hardcoded dashboard layout.
func (dr *DashRenderer) renderDefaultLayout(frame *dto.TelemetryFrame) (image.Image, error) {
	dr.fontOnce.Do(func() { dr.extractFonts() })
	w, h := float64(dr.width), float64(dr.height)
	dc := dr.getContext()

	// ── Header ──────────────────────────────────────────────────────────
	hdrH := 38.0
	drawPanel(dc, 8, 6, w-16, hdrH, 8)

	dr.face(dc, "SpaceGrotesk-Bold.ttf", 13)
	dc.SetColor(colAccent)
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

	// ── Layout ──────────────────────────────────────────────────────────
	topY := hdrH + 14.0
	pad := 8.0
	contentH := h - topY - pad

	rpmW := 40.0
	leftW := 340.0
	centerX := pad + rpmW + pad
	centerW := leftW - rpmW - pad
	rightX := pad + leftW + pad
	rightW := w - rightX - pad

	// ── RPM bar ─────────────────────────────────────────────────────────
	drawPanel(dc, pad, topY, rpmW, contentH, 8)
	rpmPct := clamp01(float64(frame.Car.RPM) / float64(frame.Car.MaxRPM))
	segs := 24
	segH := (contentH - 12) / float64(segs)
	filled := int(float64(segs) * rpmPct)
	for i := 0; i < segs; i++ {
		sy := topY + 6 + (contentH - 12) - float64(i+1)*segH
		pct := float64(i) / float64(segs)
		col := colTeal
		if pct > 0.92 {
			col = colRPMRed
		} else if pct > 0.85 {
			col = colRPMOrange
		}
		if i >= filled {
			col = dimColor(col, 0.15)
		}
		dc.SetColor(col)
		dc.DrawRoundedRectangle(pad+5, sy+1, rpmW-10, segH-2, 2)
		dc.Fill()
	}
	dr.face(dc, "JetBrainsMono-Regular.ttf", 9)
	dc.SetColor(colTextMuted)
	dc.DrawStringAnchored(fmt.Sprintf("%.0f", frame.Car.RPM), pad+rpmW/2, topY+contentH-4, 0.5, 1)

	// ── Gear + Speed ────────────────────────────────────────────────────
	gearH := contentH * 0.52
	drawPanel(dc, centerX, topY, centerW, gearH, 8)

	gear := frame.Car.Gear
	gearStr := "N"
	if gear > 0 {
		gearStr = fmt.Sprintf("%d", gear)
	} else if gear < 0 {
		gearStr = "R"
	}
	dr.face(dc, "JetBrainsMono-Bold.ttf", 110)
	dc.SetColor(colTextPri)
	dc.DrawStringAnchored(gearStr, centerX+centerW/2, topY+gearH*0.38, 0.5, 0.5)

	speed := float64(frame.Car.SpeedMS) * 3.6
	dr.face(dc, "JetBrainsMono-Bold.ttf", 30)
	dc.DrawStringAnchored(fmt.Sprintf("%.0f", speed), centerX+centerW/2, topY+gearH*0.72, 0.5, 0.5)
	dr.face(dc, "SpaceGrotesk-Regular.ttf", 11)
	dc.SetColor(colTextMuted)
	dc.DrawStringAnchored("km/h", centerX+centerW/2, topY+gearH*0.84, 0.5, 0.5)

	// ── Throttle / Brake / Clutch / Steering ────────────────────────────
	inputY := topY + gearH + pad
	inputH := contentH*0.28 - 4
	drawPanel(dc, centerX, inputY, centerW, inputH, 8)

	barX := centerX + 58.0
	barW := centerW - 70.0
	barH := 8.0

	dr.face(dc, "SpaceGrotesk-Regular.ttf", 9)
	rowH := inputH / 4
	type inputRow struct {
		label string
		value float64
		col   color.RGBA
	}
	// Steering is -1…+1; normalise to 0…1 for the bar, then reflect as centred.
	steerNorm := (float64(frame.Car.Steering) + 1.0) / 2.0
	rows := []inputRow{
		{"THR", float64(frame.Car.Throttle), colSuccess},
		{"BRK", float64(frame.Car.Brake), colDanger},
		{"CLU", float64(frame.Car.Clutch), colTextSec},
		{"STR", steerNorm, colTextSec},
	}
	for i, row := range rows {
		cy := inputY + rowH*(float64(i)+0.5)
		dc.SetColor(colTextMuted)
		dc.DrawStringAnchored(row.label, centerX+32, cy, 0.5, 0.5)
		if i == 3 {
			// Steering: centred bar (0 = full left, 0.5 = centre, 1 = full right).
			drawHBarCentered(dc, barX, cy-barH/2, barW, barH, row.value, row.col)
		} else {
			drawHBar(dc, barX, cy-barH/2, barW, barH, row.value, row.col)
		}
	}

	// ── Sectors ──────────────────────────────────────────────────────────
	sectorY := inputY + inputH + pad
	sectorH := contentH - gearH - pad - inputH - pad - pad
	if sectorH < 24 {
		sectorH = 24
	}
	drawPanel(dc, centerX, sectorY, centerW, sectorH, 8)

	dr.face(dc, "SpaceGrotesk-Regular.ttf", 10)
	dc.SetColor(colTextMuted)
	dc.DrawString("SECTORS", centerX+12, sectorY+16)

	sw := (centerW - 36) / 3
	for i, st := range []float64{frame.Lap.Sector1Time, frame.Lap.Sector2Time} {
		sx := centerX + 12 + float64(i)*sw
		dr.face(dc, "SpaceGrotesk-Regular.ttf", 9)
		dc.SetColor(colTextMuted)
		dc.DrawString(fmt.Sprintf("S%d", i+1), sx, sectorY+34)
		dr.face(dc, "JetBrainsMono-Regular.ttf", 14)
		dc.SetColor(colTextPri)
		dc.DrawString(fmtSector(st), sx, sectorY+52)
	}
	dr.face(dc, "SpaceGrotesk-Regular.ttf", 9)
	dc.SetColor(colAccent)
	dc.DrawString(fmt.Sprintf("S%d ●", frame.Lap.Sector), centerX+12+2*sw, sectorY+34)

	// ── Lap Times ───────────────────────────────────────────────────────
	lapH := contentH * 0.42
	drawPanel(dc, rightX, topY, rightW, lapH, 8)

	dr.face(dc, "SpaceGrotesk-Regular.ttf", 10)
	dc.SetColor(colTextMuted)
	dc.DrawString("LAP TIMES", rightX+12, topY+18)

	type lapEntry struct {
		label string
		time  float64
		col   color.RGBA
	}
	laps := []lapEntry{
		{"Current", frame.Lap.CurrentLapTime, colTextPri},
		{"Last", frame.Lap.LastLapTime, colTextPri},
		{"Best", frame.Lap.BestLapTime, colTeal},
	}
	for i, l := range laps {
		ly := topY + 36 + float64(i)*28
		dr.face(dc, "SpaceGrotesk-Regular.ttf", 11)
		dc.SetColor(colTextSec)
		dc.DrawString(l.label, rightX+12, ly)
		dr.face(dc, "JetBrainsMono-Bold.ttf", 16)
		dc.SetColor(l.col)
		dc.DrawStringAnchored(fmtLap(l.time), rightX+rightW-12, ly-4, 1, 0)
	}

	// Delta bar
	if frame.Lap.TargetLapTime > 0 {
		dy := topY + 36 + 3*28 + 4
		delta := frame.Lap.CurrentLapTime - frame.Lap.TargetLapTime

		dr.face(dc, "SpaceGrotesk-Regular.ttf", 9)
		dc.SetColor(colTextMuted)
		dc.DrawString("Δ Target", rightX+12, dy)

		dby := dy + 8
		dbw := rightW - 24
		dbh := 14.0
		dc.SetColor(colSurface)
		dc.DrawRoundedRectangle(rightX+12, dby, dbw, dbh, 3)
		dc.Fill()

		maxD := 2.0
		pct := math.Max(-1, math.Min(1, delta/maxD))
		mid := rightX + 12 + dbw/2
		fw := math.Abs(pct) * dbw / 2
		if delta > 0 {
			dc.SetColor(colDanger)
			dc.DrawRoundedRectangle(mid, dby+1, fw, dbh-2, 2)
		} else {
			dc.SetColor(colTeal)
			dc.DrawRoundedRectangle(mid-fw, dby+1, fw, dbh-2, 2)
		}
		dc.Fill()

		dc.SetColor(colTextMuted)
		dc.SetLineWidth(1)
		dc.DrawLine(mid, dby, mid, dby+dbh)
		dc.Stroke()

		sign, col := "+", colDanger
		if delta < 0 {
			sign, col = "-", colTeal
		}
		dr.face(dc, "JetBrainsMono-Bold.ttf", 12)
		dc.SetColor(col)
		dc.DrawStringAnchored(fmt.Sprintf("%s%.3f", sign, math.Abs(delta)), mid, dby+dbh+14, 0.5, 0.5)
	}

	// ── Fuel ─────────────────────────────────────────────────────────────
	fuelY := topY + lapH + pad
	fuelH := contentH*0.28 - 4
	drawPanel(dc, rightX, fuelY, rightW, fuelH, 8)

	dr.face(dc, "SpaceGrotesk-Regular.ttf", 10)
	dc.SetColor(colTextMuted)
	dc.DrawString("FUEL", rightX+12, fuelY+18)

	dr.face(dc, "JetBrainsMono-Bold.ttf", 22)
	dc.SetColor(colTextPri)
	dc.DrawString(fmt.Sprintf("%.1f L", frame.Car.Fuel), rightX+12, fuelY+46)

	dr.face(dc, "JetBrainsMono-Regular.ttf", 12)
	dc.SetColor(colTextSec)
	dc.DrawStringAnchored(fmt.Sprintf("%.2f L/lap", frame.Car.FuelPerLap), rightX+rightW-12, fuelY+44, 1, 0)

	if frame.Car.FuelPerLap > 0 {
		rem := float64(frame.Car.Fuel) / float64(frame.Car.FuelPerLap)
		dr.face(dc, "SpaceGrotesk-Regular.ttf", 11)
		dc.SetColor(colTextMuted)
		dc.DrawString(fmt.Sprintf("~%.0f laps remaining", rem), rightX+12, fuelY+fuelH-10)
	}

	// ── Tyre temps ───────────────────────────────────────────────────────
	tyreY := fuelY + fuelH + pad
	tyreH := contentH - lapH - pad - fuelH - pad - pad
	if tyreH < 40 {
		tyreH = 40
	}
	drawPanel(dc, rightX, tyreY, rightW, tyreH, 8)

	dr.face(dc, "SpaceGrotesk-Regular.ttf", 10)
	dc.SetColor(colTextMuted)
	dc.DrawString("TYRE TEMPS", rightX+12, tyreY+18)

	tireLabels := [4]string{"FL", "FR", "RL", "RR"}
	for i, tire := range frame.Tires {
		col := i % 2
		row := i / 2
		tw := (rightW - 36) / 2
		tx := rightX + 12 + float64(col)*(tw+12)
		ty := tyreY + 30 + float64(row)*32
		avgTemp := (float64(tire.TempInner) + float64(tire.TempMiddle) + float64(tire.TempOuter)) / 3

		dr.face(dc, "SpaceGrotesk-Regular.ttf", 10)
		dc.SetColor(colTextMuted)
		dc.DrawString(tireLabels[i], tx, ty)

		dr.face(dc, "JetBrainsMono-Bold.ttf", 15)
		dc.SetColor(tyreColor(avgTemp))
		dc.DrawStringAnchored(fmt.Sprintf("%.0f°", avgTemp), tx+tw, ty-2, 1, 0)
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

// ensureBg pre-renders the static background (bg fill + orange glow) into bgImg
// once per renderer lifetime. Subsequent frames blit this image instead of
// re-running 80+ ellipse draw calls.
func (dr *DashRenderer) ensureBg() {
	if dr.bgImg != nil {
		return
	}
	w := float64(dr.width)
	tmp := gg.NewContext(dr.width, dr.height)
	tmp.SetColor(colBg)
	tmp.Clear()
	for i := 0; i < 80; i++ {
		a := 0.035 * (1.0 - float64(i)/80.0)
		tmp.SetRGBA255(int(colAccent.R), int(colAccent.G), int(colAccent.B), int(a*255))
		tmp.DrawEllipse(w/2, 0, w*0.5-float64(i)*2, 80-float64(i))
		tmp.Fill()
	}
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
