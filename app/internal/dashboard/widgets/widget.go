// Package widgets contains the widget registry, element types, and all widget
// definitions for the dashboard. Widgets are pure data — they return []Element
// describing what to draw. All rendering lives in the dashboard/painter package.
// This package has no dependency on gg, so it can be tested without a display.
package widgets

import (
	"fmt"
	"strconv"

	"github.com/kratofl/sprint/app/internal/dashboard/config"
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
//	         HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorExpr{Ref: "fg"}},
//	    }
//	}
//
//	func init() { Register(myThingWidget{}) }
type Widget interface {
	Meta() WidgetMeta
	Definition(config map[string]any) []Element
}

// ConfigDef and Option are re-exported from dashboard/config so that callers
// importing only this package continue to work without change.
type ConfigDef = config.ConfigDef
type Option = config.Option

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
	DefaultDefinition []Element          `json:"defaultDefinition,omitempty"`
}

var (
	widgetRegistry = map[WidgetType]Widget{}
	widgetMeta     = map[WidgetType]WidgetMeta{}
)

// Register registers a Widget implementation.
// The update_rate ConfigDef is automatically appended to the widget's ConfigDefs.
// DefaultDefinition is pre-computed using the default config so the catalog
// includes the element layout for editor preview rendering.
// Call from init() in widget_*.go files.
func Register(w Widget) {
	m := w.Meta()
	catLabel, ok := categoryLabels[m.Category]
	if !ok {
		catLabel = string(m.Category)
	}
	m.CategoryLabel = catLabel
	m.ConfigDefs = append(m.ConfigDefs, updateRateConfigDef(m.DefaultUpdateHz))
	m.DefaultDefinition = w.Definition(nil)
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

// FmtLap formats t (seconds) using the default M:SS.mmm layout.
// Returns "-.---.---" when t ≤ 0.
func FmtLap(seconds float64) string {
	return FmtLapWith(seconds, LapFormatMSSmmm)
}

// FmtLapWith formats t (seconds) according to the given LapFormat.
// Returns a format-appropriate placeholder when t ≤ 0.
func FmtLapWith(seconds float64, format LapFormat) string {
	switch format {
	case LapFormatMSSmm:
		if seconds <= 0 {
			return "-.---.--"
		}
		m := int(seconds) / 60
		s := seconds - float64(m*60)
		return fmt.Sprintf("%d:%05.2f", m, s)
	case LapFormatSSmmm:
		if seconds <= 0 {
			return "--.---"
		}
		return fmt.Sprintf("%.3f", seconds)
	default: // LapFormatMSSmmm
		if seconds <= 0 {
			return "-.---.---"
		}
		m := int(seconds) / 60
		s := seconds - float64(m*60)
		return fmt.Sprintf("%d:%06.3f", m, s)
	}
}

// FmtSector formats t (seconds) using the default SS.mmm layout.
// Returns "--.---" when t ≤ 0.
func FmtSector(seconds float64) string {
	return FmtSectorWith(seconds, LapFormatMSSmmm)
}

// FmtSectorWith formats a sector time (seconds) according to the given LapFormat.
// Sector times always show as total seconds; the LapFormat only controls precision.
func FmtSectorWith(seconds float64, format LapFormat) string {
	if seconds <= 0 {
		return "--.---"
	}
	switch format {
	case LapFormatMSSmm:
		return fmt.Sprintf("%.2f", seconds)
	default: // LapFormatMSSmmm, LapFormatSSmmm
		return fmt.Sprintf("%.3f", seconds)
	}
}
