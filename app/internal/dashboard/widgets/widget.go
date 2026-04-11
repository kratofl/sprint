// Package widgets contains the widget registry, draw context, and all widget
// implementations for the dashboard. It has no internal imports so it can be
// imported by dashboard/ without creating cycles.
package widgets

import (
	"encoding/hex"
	"fmt"
	"image/color"
	"strings"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/pkg/dto"
)

// WidgetType is the canonical identifier for a dashboard widget kind.
// Each widget_*.go file defines its own WidgetType constant.
type WidgetType string

// Widget is the interface implemented by every dashboard widget.
// Create a new widget by defining a struct that implements this interface,
// then calling Register in an init() function.
type Widget interface {
	Meta() WidgetMeta
	Draw(ctx WidgetCtx)
}

// ConfigDef describes one configurable parameter for a widget instance.
type ConfigDef struct {
	Key     string   `json:"key"`
	Label   string   `json:"label"`
	Type    string   `json:"type"` // "select", "number", "boolean", "text"
	Options []Option `json:"options,omitempty"`
	Default string   `json:"default"` // string representation of default value
}

// Option is one choice in a "select" ConfigDef.
type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

// Category is the palette grouping for a widget.
type Category string

const (
	CategoryLayout Category = "layout"
	CategoryTiming Category = "timing"
	CategoryCar    Category = "car"
	CategoryRace   Category = "race"
)

// categoryLabels maps canonical category IDs to display labels.
var categoryLabels = map[Category]string{
	CategoryLayout: "Layout",
	CategoryTiming: "Timing",
	CategoryCar:    "Car",
	CategoryRace:   "Race",
}

// WidgetMeta holds the type, display name, palette category, and draw function.
// The Fn field is never serialised; it is used only by the render pipeline.
type WidgetMeta struct {
	Type            WidgetType  `json:"type"`
	Label           string      `json:"label"`
	Category        Category    `json:"category"`
	CategoryLabel   string      `json:"categoryLabel"`
	ConfigDefs      []ConfigDef `json:"configDefs,omitempty"`
	DefaultColSpan  int         `json:"defaultColSpan"`
	DefaultRowSpan  int         `json:"defaultRowSpan"`
	IdleCapable     bool        `json:"idleCapable"`
	DefaultUpdateHz float64     `json:"defaultUpdateHz"`
}

var (
	widgetRegistry = map[WidgetType]Widget{}
	widgetMeta     = map[WidgetType]WidgetMeta{}
)

// Register registers a Widget implementation.
// The update_rate ConfigDef is automatically appended to the widget's ConfigDefs.
// Call from init() in widget_*.go files.
func Register(w Widget) {
	m := w.Meta()
	catLabel, ok := categoryLabels[m.Category]
	if !ok {
		catLabel = string(m.Category)
	}
	m.CategoryLabel = catLabel
	m.ConfigDefs = append(m.ConfigDefs, updateRateConfigDef(m.DefaultUpdateHz))
	widgetRegistry[m.Type] = w
	widgetMeta[m.Type] = m
}

// GetMeta returns the WidgetMeta for the given widget type.
func GetMeta(t WidgetType) (WidgetMeta, bool) {
	m, ok := widgetMeta[t]
	return m, ok
}

// updateRateConfigDef returns the standard update_rate select ConfigDef with the given default Hz.
func updateRateConfigDef(hz float64) ConfigDef {
	return ConfigDef{
		Key:   "update_rate",
		Label: "Update Rate",
		Type:  "select",
		Options: []Option{
			{Value: "30", Label: "30 fps"},
			{Value: "15", Label: "15 fps"},
			{Value: "10", Label: "10 fps"},
			{Value: "5", Label: "5 fps"},
			{Value: "2", Label: "2 fps"},
			{Value: "1", Label: "1 fps"},
		},
		Default: fmt.Sprintf("%.0f", hz),
	}
}

// WidgetCatalog returns metadata for every registered widget.
func WidgetCatalog() []WidgetMeta {
	out := make([]WidgetMeta, 0, len(widgetMeta))
	for _, m := range widgetMeta {
		out = append(out, m)
	}
	return out
}

// Dispatch calls the registered Draw method for the given widget type.
// w provides the bounding box; FontLoader is the painter's font-loading function.
// Unknown types are silently skipped.
func Dispatch(t WidgetType, dc *gg.Context, frame *dto.TelemetryFrame, x, y, w, h float64, fontLoader func(*gg.Context, string, float64), config map[string]any) {
	widget, ok := widgetRegistry[t]
	if !ok {
		return
	}
	widget.Draw(WidgetCtx{
		DC:         dc,
		Frame:      frame,
		X:          x,
		Y:          y,
		W:          w,
		H:          h,
		FontLoader: fontLoader,
		Config:     config,
	})
}

// WidgetCtx is the drawing context passed to every widget's Draw method.
//
// # Adding a new widget
//
//  1. Create app/internal/dashboard/widgets/widget_<name>.go.
//  2. Define a WidgetType constant and a struct implementing Widget.
//  3. Call Register in init(). No other files need to change.
//
// Example:
//
//	const WidgetMyThing WidgetType = "my_thing"
//
//	type myThingWidget struct{}
//
//	func (myThingWidget) Meta() WidgetMeta {
//	    return WidgetMeta{Type: WidgetMyThing, Label: "My Thing", Category: CategoryCar,
//	        DefaultColSpan: 4, DefaultRowSpan: 3, DefaultUpdateHz: 15}
//	}
//
//	func (myThingWidget) Draw(c WidgetCtx) {
//	    c.Panel()
//	    c.FontNumber(c.H * 0.5)
//	    c.DC.SetColor(ColTextPri)
//	    c.DC.DrawStringAnchored(c.FmtSpeed(float64(c.Frame.Car.SpeedMS)), c.CX(), c.CY(), 0.5, 0.5)
//	}
//
//	func init() { Register(myThingWidget{}) }
type WidgetCtx struct {
	DC         *gg.Context
	Frame      *dto.TelemetryFrame
	X, Y, W, H float64
	// FontLoader loads a named font face at the given size onto dc.
	// Provided by the Painter — use the FontXxx helpers instead of calling directly.
	FontLoader func(dc *gg.Context, name string, size float64)
	// Config holds optional widget-specific configuration from the layout.
	Config map[string]any
}

// Layout helpers.

// ConfigString returns a string config value by key, or defaultVal if absent.
func (c WidgetCtx) ConfigString(key, defaultVal string) string {
	if c.Config == nil {
		return defaultVal
	}
	if v, ok := c.Config[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return defaultVal
}

// ConfigBool returns a bool config value by key, or defaultVal if absent.
func (c WidgetCtx) ConfigBool(key string, defaultVal bool) bool {
	if c.Config == nil {
		return defaultVal
	}
	if v, ok := c.Config[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return defaultVal
}

// ConfigFloat returns a float64 config value by key, or defaultVal if absent.
func (c WidgetCtx) ConfigFloat(key string, defaultVal float64) float64 {
	if c.Config == nil {
		return defaultVal
	}
	if v, ok := c.Config[key]; ok {
		switch n := v.(type) {
		case float64:
			return n
		case float32:
			return float64(n)
		case int:
			return float64(n)
		}
	}
	return defaultVal
}

// ConfigColor parses a hex color string config value (e.g. "#ff906c" or "ff906c").
// Returns defaultVal if the key is absent or the value cannot be parsed.
func (c WidgetCtx) ConfigColor(key string, defaultVal color.RGBA) color.RGBA {
	s := c.ConfigString(key, "")
	if s == "" {
		return defaultVal
	}
	s = strings.TrimPrefix(s, "#")
	if len(s) != 6 {
		return defaultVal
	}
	b, err := hex.DecodeString(s)
	if err != nil || len(b) != 3 {
		return defaultVal
	}
	return color.RGBA{R: b[0], G: b[1], B: b[2], A: 255}
}

const defaultBw = 1

func (c WidgetCtx) Panel()                 { drawPanel(c.DC, c.X, c.Y, c.W, c.H, 0, defaultBw) }
func (c WidgetCtx) PanelR(r float64)       { drawPanel(c.DC, c.X, c.Y, c.W, c.H, r, defaultBw) }
func (c WidgetCtx) PanelBW(bw float64)     { drawPanel(c.DC, c.X, c.Y, c.W, c.H, 0, bw) }
func (c WidgetCtx) PanelRBW(r, bw float64) { drawPanel(c.DC, c.X, c.Y, c.W, c.H, r, bw) }
func (c WidgetCtx) CX() float64            { return c.X + c.W/2 }
func (c WidgetCtx) CY() float64            { return c.Y + c.H/2 }

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
