// Package widgets contains the widget registry, element types, and all widget
// definitions for the dashboard. Widgets are pure data — they return []Element
// describing what to draw. All rendering lives in the dashboard/painter package.
// This package has no dependency on gg, so it can be tested without a display.
package widgets

import (
	"fmt"
	"strconv"
)

// WidgetType is the canonical identifier for a dashboard widget kind.
// Each widget_*.go file defines its own WidgetType constant.
type WidgetType string

// Widget is the interface implemented by every dashboard widget.
// Definition returns a slice of elements describing the widget's visuals.
// config holds the per-instance configuration from DashWidget.Config.
// No gg drawing calls should appear in any Widget implementation — all
// rendering is centralised in the dashboard Painter.
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
//	func (myThingWidget) Definition(_ map[string]any) []Element {
//	    return []Element{
//	        {Kind: ElemPanel},
//	        {Kind: ElemText, Binding: "car.speedKPH", Format: "int",
//	         Font: FontNumber, FontScale: 0.5, X: 0.5, Y: 0.5,
//	         AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "fg"}},
//	    }
//	}
//
//	func init() { Register(myThingWidget{}) }
type Widget interface {
	Meta() WidgetMeta
	Definition(config map[string]any) []Element
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

// WidgetMeta holds the widget type, display name, palette category,
// config schema, and default grid dimensions.
type WidgetMeta struct {
	Type              WidgetType         `json:"type"`
	Label             string             `json:"label"`
	Category          Category           `json:"category"`
	CategoryLabel     string             `json:"categoryLabel"`
	ConfigDefs        []ConfigDef        `json:"configDefs,omitempty"`
	DefaultColSpan    int                `json:"defaultColSpan"`
	DefaultRowSpan    int                `json:"defaultRowSpan"`
	IdleCapable       bool               `json:"idleCapable"`
	DefaultUpdateHz   float64            `json:"defaultUpdateHz"`
	DefaultPanelRules []ConditionalRule  `json:"defaultPanelRules,omitempty"`
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

// Get returns the registered Widget for the given type, or (nil, false) if unknown.
func Get(t WidgetType) (Widget, bool) {
	w, ok := widgetRegistry[t]
	return w, ok
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

// configString returns a string config value by key, or defaultVal if absent.
func configString(config map[string]any, key, defaultVal string) string {
	if config == nil {
		return defaultVal
	}
	if v, ok := config[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return defaultVal
}

// configFloat returns a float64 config value by key, or defaultVal if absent or unparseable.
func configFloat(config map[string]any, key string, defaultVal float64) float64 {
	if config == nil {
		return defaultVal
	}
	if v, ok := config[key]; ok {
		switch n := v.(type) {
		case float64:
			return n
		case string:
			if f, err := strconv.ParseFloat(n, 64); err == nil {
				return f
			}
		}
	}
	return defaultVal
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
