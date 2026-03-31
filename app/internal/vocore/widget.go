package vocore

import (
	"fmt"
	"image/color"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/app/internal/dash"
	"github.com/kratofl/sprint/pkg/dto"
)

// WidgetFn is the drawing function signature for a dashboard widget.
// All registered widget renderers implement this type.
type WidgetFn func(WidgetCtx)

// widgetRegistry maps widget types to their drawing functions.
// Populated by init() functions in each widget_*.go file.
var widgetRegistry = map[dash.WidgetType]WidgetFn{}

// registerWidget adds a widget renderer to the registry.
// Call this from an init() function in your widget file.
func registerWidget(t dash.WidgetType, fn WidgetFn) {
	widgetRegistry[t] = fn
}

// WidgetCtx is the drawing context passed to every widget renderer.
// It provides the gg drawing context, the current telemetry frame, the
// widget's bounding box, and convenience helpers for common draw patterns.
//
// Widget bounding box coordinates (X, Y, W, H) are in screen pixels, with
// (0, 0) at the top-left corner of the VoCore screen.
//
// # Adding a new widget
//
//  1. Add a WidgetType constant + metadata entry in app/internal/dash/layout.go.
//  2. Create app/internal/vocore/widget_<name>.go with an init() that calls
//     registerWidget and a draw function that accepts WidgetCtx.
//  3. No other files need to change.
//
// Example — minimal widget:
//
//	func init() { registerWidget(dash.WidgetMyThing, drawMyThing) }
//
//	func drawMyThing(c WidgetCtx) {
//	    c.Panel()
//	    c.FontNumber(c.H * 0.5)
//	    c.DC.SetColor(colTextPri)
//	    c.DC.DrawStringAnchored(c.FmtSpeed(float64(c.Frame.Car.SpeedMS)), c.CX(), c.CY(), 0.5, 0.5)
//	}
type WidgetCtx struct {
	// DC is the shared gg.Context for the whole frame — draw everything here.
	DC *gg.Context
	// Frame is the current telemetry snapshot.
	Frame *dto.TelemetryFrame
	// X, Y, W, H define the widget's bounding box in screen pixels.
	X, Y, W, H float64

	// dr provides access to the font cache. Use the FontXxx helpers instead.
	dr *DashRenderer
}

// ── Layout helpers ────────────────────────────────────────────────────────────

// Panel draws the standard elevated panel background for this widget's bounding
// box with the default corner radius (8 px).
func (c WidgetCtx) Panel() { drawPanel(c.DC, c.X, c.Y, c.W, c.H, 8) }

// PanelR draws a panel with a custom corner radius r.
func (c WidgetCtx) PanelR(r float64) { drawPanel(c.DC, c.X, c.Y, c.W, c.H, r) }

// CX returns the horizontal centre of the widget bounding box.
func (c WidgetCtx) CX() float64 { return c.X + c.W/2 }

// CY returns the vertical centre of the widget bounding box.
func (c WidgetCtx) CY() float64 { return c.Y + c.H/2 }

// ── Font helpers ──────────────────────────────────────────────────────────────
// Font size is in logical points. Scale relative to c.H for responsive layout,
// e.g. c.FontLabel(c.H * 0.12).

// FontLabel sets SpaceGrotesk-Regular at size.
// Use for UI labels, captions, and metadata text.
func (c WidgetCtx) FontLabel(size float64) { c.dr.face(c.DC, "SpaceGrotesk-Regular.ttf", size) }

// FontBold sets SpaceGrotesk-Bold at size.
// Use for section headers and category titles.
func (c WidgetCtx) FontBold(size float64) { c.dr.face(c.DC, "SpaceGrotesk-Bold.ttf", size) }

// FontNumber sets JetBrainsMono-Bold at size.
// Use for large primary telemetry values: gear display, speed, lap time hero.
func (c WidgetCtx) FontNumber(size float64) { c.dr.face(c.DC, "JetBrainsMono-Bold.ttf", size) }

// FontMono sets JetBrainsMono-Regular at size.
// Use for secondary mono-spaced numbers: sector times, auxiliary values.
func (c WidgetCtx) FontMono(size float64) { c.dr.face(c.DC, "JetBrainsMono-Regular.ttf", size) }

// ── Bar helpers ───────────────────────────────────────────────────────────────

// HBar draws a left-aligned horizontal progress bar.
// x, y, w, h are absolute screen coordinates. pct is clamped to [0, 1].
// col is the filled bar colour; the unfilled track is a dimmed version of col.
func (c WidgetCtx) HBar(x, y, w, h, pct float64, col color.RGBA) {
	drawHBar(c.DC, x, y, w, h, pct, col)
}

// HBarCentered draws a centred horizontal bar where 0.5 is the neutral position.
// Values < 0.5 extend left; values > 0.5 extend right.
// Designed for steering input, where the game range −1…+1 is normalised to 0…1.
func (c WidgetCtx) HBarCentered(x, y, w, h, pct float64, col color.RGBA) {
	drawHBarCentered(c.DC, x, y, w, h, pct, col)
}

// ── Formatter helpers ─────────────────────────────────────────────────────────

// FmtLap formats t (seconds) as "M:SS.mmm". Returns "-.---.---" when t ≤ 0.
func (c WidgetCtx) FmtLap(t float64) string { return fmtLap(t) }

// FmtSector formats t (seconds) as "SS.mmm". Returns "--.---" when t ≤ 0.
func (c WidgetCtx) FmtSector(t float64) string { return fmtSector(t) }

// FmtSpeed converts ms (m/s) to km/h and returns it as an integer string.
func (c WidgetCtx) FmtSpeed(ms float64) string { return fmt.Sprintf("%.0f", ms*3.6) }
