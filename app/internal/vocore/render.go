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

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/pkg/dto"
)

//go:embed fonts/*.ttf
var fontsFS embed.FS

// Sprint design tokens.
var (
	colBg        = color.RGBA{8, 8, 9, 255}
	colSurface   = color.RGBA{20, 20, 23, 255}
	colBorder    = color.RGBA{255, 255, 255, 20}
	colAccent    = color.RGBA{239, 129, 24, 255}
	colTeal      = color.RGBA{30, 165, 140, 255}
	colSuccess   = color.RGBA{52, 211, 153, 255}
	colDanger    = color.RGBA{248, 113, 113, 255}
	colWarning   = color.RGBA{251, 191, 36, 255}
	colTextPri   = color.RGBA{244, 244, 245, 255}
	colTextSec   = color.RGBA{161, 161, 170, 255}
	colTextMuted = color.RGBA{113, 113, 122, 255}
	colRPMGreen  = color.RGBA{34, 197, 94, 255}
)

// DashRenderer produces a full dashboard image for a given telemetry frame.
type DashRenderer struct {
	width, height int
	fontDir       string
	fontOnce      sync.Once
}

// NewDashRenderer creates a renderer for the given screen dimensions.
func NewDashRenderer(width, height int) *DashRenderer {
	return &DashRenderer{width: width, height: height}
}

// RenderFrame renders a complete dashboard image for the given telemetry frame.
func (dr *DashRenderer) RenderFrame(frame *dto.TelemetryFrame) (image.Image, error) {
	dr.fontOnce.Do(func() { dr.extractFonts() })

	w, h := float64(dr.width), float64(dr.height)
	dc := gg.NewContext(dr.width, dr.height)

	// Background
	dc.SetColor(colBg)
	dc.Clear()

	// Subtle orange glow at top
	for i := 0; i < 80; i++ {
		a := 0.035 * (1.0 - float64(i)/80.0)
		dc.SetRGBA255(239, 129, 24, int(a*255))
		dc.DrawEllipse(w/2, 0, w*0.5-float64(i)*2, 80-float64(i))
		dc.Fill()
	}

	// ── Header ──────────────────────────────────────────────────────────
	hdrH := 38.0
	drawPanel(dc, 8, 6, w-16, hdrH, 8)

	dr.face(dc, "Inter-Bold.ttf", 13)
	dc.SetColor(colAccent)
	dc.DrawStringAnchored("SPRINT", 24, 6+hdrH/2, 0, 0.5)

	dr.face(dc, "Inter-Regular.ttf", 12)
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
	dr.face(dc, "Inter-Regular.ttf", 10)
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
		col := colRPMGreen
		if pct > 0.85 {
			col = colDanger
		} else if pct > 0.65 {
			col = colWarning
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
	dr.face(dc, "Inter-Regular.ttf", 11)
	dc.SetColor(colTextMuted)
	dc.DrawStringAnchored("km/h", centerX+centerW/2, topY+gearH*0.84, 0.5, 0.5)

	// ── Throttle / Brake ────────────────────────────────────────────────
	inputY := topY + gearH + pad
	inputH := contentH*0.2 - 4
	drawPanel(dc, centerX, inputY, centerW, inputH, 8)

	barX := centerX + 58.0
	barW := centerW - 70.0
	barH := 10.0

	dr.face(dc, "Inter-Regular.ttf", 10)
	dc.SetColor(colTextMuted)
	dc.DrawStringAnchored("THR", centerX+32, inputY+inputH*0.33, 0.5, 0.5)
	drawHBar(dc, barX, inputY+inputH*0.33-barH/2, barW, barH, float64(frame.Car.Throttle), colSuccess)

	dc.SetColor(colTextMuted)
	dc.DrawStringAnchored("BRK", centerX+32, inputY+inputH*0.67, 0.5, 0.5)
	drawHBar(dc, barX, inputY+inputH*0.67-barH/2, barW, barH, float64(frame.Car.Brake), colDanger)

	// ── Sectors ──────────────────────────────────────────────────────────
	sectorY := inputY + inputH + pad
	sectorH := contentH - gearH - pad - inputH - pad - pad
	if sectorH < 30 {
		sectorH = 30
	}
	drawPanel(dc, centerX, sectorY, centerW, sectorH, 8)

	dr.face(dc, "Inter-Regular.ttf", 10)
	dc.SetColor(colTextMuted)
	dc.DrawString("SECTORS", centerX+12, sectorY+16)

	sw := (centerW - 36) / 3
	for i, st := range []float64{frame.Lap.Sector1Time, frame.Lap.Sector2Time} {
		sx := centerX + 12 + float64(i)*sw
		dr.face(dc, "Inter-Regular.ttf", 9)
		dc.SetColor(colTextMuted)
		dc.DrawString(fmt.Sprintf("S%d", i+1), sx, sectorY+34)
		dr.face(dc, "JetBrainsMono-Regular.ttf", 14)
		dc.SetColor(colTextPri)
		dc.DrawString(fmtSector(st), sx, sectorY+52)
	}
	dr.face(dc, "Inter-Regular.ttf", 9)
	dc.SetColor(colAccent)
	dc.DrawString(fmt.Sprintf("S%d ●", frame.Lap.Sector), centerX+12+2*sw, sectorY+34)

	// ── Lap Times ───────────────────────────────────────────────────────
	lapH := contentH * 0.42
	drawPanel(dc, rightX, topY, rightW, lapH, 8)

	dr.face(dc, "Inter-Regular.ttf", 10)
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
		dr.face(dc, "Inter-Regular.ttf", 11)
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

		dr.face(dc, "Inter-Regular.ttf", 9)
		dc.SetColor(colTextMuted)
		dc.DrawString("Δ Target", rightX+12, dy)

		dby := dy + 8
		dbw := rightW - 24
		dbh := 14.0
		dc.SetColor(color.RGBA{30, 30, 35, 255})
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

	dr.face(dc, "Inter-Regular.ttf", 10)
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
		dr.face(dc, "Inter-Regular.ttf", 11)
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

	dr.face(dc, "Inter-Regular.ttf", 10)
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

		dr.face(dc, "Inter-Regular.ttf", 10)
		dc.SetColor(colTextMuted)
		dc.DrawString(tireLabels[i], tx, ty)

		dr.face(dc, "JetBrainsMono-Bold.ttf", 15)
		dc.SetColor(tyreColor(avgTemp))
		dc.DrawStringAnchored(fmt.Sprintf("%.0f°", avgTemp), tx+tw, ty-2, 1, 0)
	}

	// ── Flag overlay ─────────────────────────────────────────────────────
	if frame.Flags.Yellow || frame.Flags.Red || frame.Flags.SafetyCar {
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
		dr.face(dc, "Inter-Bold.ttf", 14)
		dc.SetColor(colBg)
		dc.DrawStringAnchored(flagText, w/2, h-15, 0.5, 0.5)
	}

	return dc.Image(), nil
}

// ── drawing helpers ──────────────────────────────────────────────────────────

func drawPanel(dc *gg.Context, x, y, w, h, r float64) {
	dc.SetColor(colSurface)
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

// Close removes the temporary font directory. Safe to call multiple times.
func (dr *DashRenderer) Close() {
	if dr.fontDir != "" {
		os.RemoveAll(dr.fontDir)
		dr.fontDir = ""
	}
}

// ── font management ──────────────────────────────────────────────────────────

func (dr *DashRenderer) face(dc *gg.Context, name string, size float64) {
	path := filepath.Join(dr.fontDir, name)
	if err := dc.LoadFontFace(path, size); err != nil {
		// Silently fall back — text will render in whatever was last loaded
		return
	}
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
