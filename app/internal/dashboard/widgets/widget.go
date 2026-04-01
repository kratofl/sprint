// Package widgets contains the widget registry, draw context, and all widget
// implementations for the dashboard. It has no internal imports so it can be
// imported by dashboard/ without creating cycles.
package widgets

import (
	"fmt"
	"image/color"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/pkg/dto"
)

// WidgetType is the canonical identifier for a dashboard widget kind.
// Each widget_*.go file defines its own WidgetType constant.
type WidgetType string

// WidgetFn is the drawing function signature for a dashboard widget.
type WidgetFn func(WidgetCtx)

// WidgetMeta holds the type, display name, palette category, and draw function.
// The Fn field is never serialised; it is used only by the render pipeline.
type WidgetMeta struct {
	Type     WidgetType `json:"type"`
	Label    string     `json:"label"`
	Category string     `json:"category"`
	Fn       WidgetFn   `json:"-"`
}

var (
	widgetRegistry = map[WidgetType]WidgetFn{}
	widgetMeta     = map[WidgetType]WidgetMeta{}
)

// RegisterWidget adds a widget renderer and its metadata to the registry.
// Call from an init() function in your widget_*.go file.
func RegisterWidget(t WidgetType, label, category string, fn WidgetFn) {
	widgetRegistry[t] = fn
	widgetMeta[t] = WidgetMeta{Type: t, Label: label, Category: category, Fn: fn}
}

// WidgetCatalog returns metadata for every registered widget.
func WidgetCatalog() []WidgetMeta {
	out := make([]WidgetMeta, 0, len(widgetMeta))
	for _, m := range widgetMeta {
		out = append(out, m)
	}
	return out
}

// Dispatch calls the registered draw function for the given widget type.
// w provides the bounding box; FontLoader is the painter's font-loading function.
// Unknown types are silently skipped.
func Dispatch(t WidgetType, dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64, fontLoader func(*gg.Context, string, float64)) {
	fn, ok := widgetRegistry[t]
	if !ok {
		return
	}
	fn(WidgetCtx{
		DC:         dc,
		Frame:      frame,
		X:          x,
		Y:          y,
		W:          w,
		H:          h,
		FontLoader: fontLoader,
	})
}

// WidgetCtx is the drawing context passed to every widget renderer.
//
// # Adding a new widget
//
//  1. Create app/internal/dashboard/widgets/widget_<name>.go.
//  2. Define a WidgetType constant, call RegisterWidget in init(), write the draw function.
//  3. No other files need to change.
//
// Example:
//
//	const WidgetMyThing WidgetType = "my_thing"
//
//	func init() { RegisterWidget(WidgetMyThing, "My Thing", "Car", drawMyThing) }
//
//	func drawMyThing(c WidgetCtx) {
//	    c.Panel()
//	    c.FontNumber(c.H * 0.5)
//	    c.DC.SetColor(ColTextPri)
//	    c.DC.DrawStringAnchored(c.FmtSpeed(float64(c.Frame.Car.SpeedMS)), c.CX(), c.CY(), 0.5, 0.5)
//	}
type WidgetCtx struct {
	DC          *gg.Context
	Frame       *dto.TelemetryFrame
	X, Y, W, H float64
	// FontLoader loads a named font face at the given size onto dc.
	// Provided by the Painter — use the FontXxx helpers instead of calling directly.
	FontLoader func(dc *gg.Context, name string, size float64)
}

// Layout helpers.

func (c WidgetCtx) Panel()           { drawPanel(c.DC, c.X, c.Y, c.W, c.H, 0) }
func (c WidgetCtx) PanelR(r float64) { drawPanel(c.DC, c.X, c.Y, c.W, c.H, r) }
func (c WidgetCtx) CX() float64      { return c.X + c.W/2 }
func (c WidgetCtx) CY() float64      { return c.Y + c.H/2 }

// Font helpers.

func (c WidgetCtx) FontLabel(size float64)  { c.FontLoader(c.DC, "SpaceGrotesk-Regular.ttf", size) }
func (c WidgetCtx) FontBold(size float64)   { c.FontLoader(c.DC, "SpaceGrotesk-Bold.ttf", size) }
func (c WidgetCtx) FontNumber(size float64) { c.FontLoader(c.DC, "JetBrainsMono-Bold.ttf", size) }
func (c WidgetCtx) FontMono(size float64)   { c.FontLoader(c.DC, "JetBrainsMono-Regular.ttf", size) }

// Bar helpers.

func (c WidgetCtx) HBar(x, y, w, h, pct float64, col color.RGBA) {
	drawHBar(c.DC, x, y, w, h, pct, col)
}

func (c WidgetCtx) HBarCentered(x, y, w, h, pct float64, col color.RGBA) {
	drawHBarCentered(c.DC, x, y, w, h, pct, col)
}

// Formatter helpers.

func (c WidgetCtx) FmtLap(t float64) string    { return FmtLap(t) }
func (c WidgetCtx) FmtSector(t float64) string { return FmtSector(t) }
func (c WidgetCtx) FmtSpeed(ms float64) string { return fmt.Sprintf("%.0f", ms*3.6) }
