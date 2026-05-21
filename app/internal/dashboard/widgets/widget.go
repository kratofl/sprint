// Package widgets contains the widget registry, element types, and all widget
// definitions for the dashboard. Widgets are pure data — they return []Element
// describing what to draw. All rendering lives in the dashboard/painter package.
// This package has no dependency on gg, so it can be tested without a display.
package widgets

import (
	"fmt"
	"math"
	"strconv"
	"strings"
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
// The painter automatically prepends a panel background and a header label
// based on WidgetMeta.Panel and WidgetMeta.Header. Widgets should NOT
// include ElemPanel or header ElemText in their Definition() return value
// unless they need full manual control (set Header.Disabled / Panel.Disabled).
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
//	    return WidgetMeta{Type: WidgetMyThing, Name: "My Thing", Category: CategoryCar,
//	        DefaultColSpan: 4, DefaultRowSpan: 3, DefaultUpdateHz: Hz15}
//	}
//
//	func (myThingWidget) Definition(_ map[string]any) []Element {
//	    return []Element{
//	        Text{Binding: "car.speedKPH", Format: "int", X: 0.5, Y: 0.5,
//	             Style: TextStyle{Font: FontFamilyMono, FontSize: 0.5, IsBold: true,
//	                 HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorRefForeground.Expr()}},
//	    }
//	}
//
//	func init() { Register(myThingWidget{}) }
type Widget interface {
	Meta() WidgetMeta
	Definition(config map[string]any) []Element
}

// Category is the palette grouping for a widget.
type Category string

const (
	CategoryLayout Category = "layout"
	CategoryTiming Category = "timing"
	CategoryCar    Category = "car"
	CategoryRace   Category = "race"
)

// Standard update rates for DefaultUpdateHz.
const (
	Hz1  float64 = 1
	Hz2  float64 = 2
	Hz5  float64 = 5
	Hz10 float64 = 10
	Hz15 float64 = 15
	Hz30 float64 = 30
)

// categoryLabels maps canonical category IDs to display labels.
var categoryLabels = map[Category]string{
	CategoryLayout: "Layout",
	CategoryTiming: "Timing",
	CategoryCar:    "Car",
	CategoryRace:   "Race",
}

// PanelConfig controls the automatic panel background drawn by the painter.
// Zero value = standard bordered panel.
type PanelConfig struct {
	Disabled bool    `json:"disabled,omitempty"` // true = no panel background
	CornerR  float64 `json:"cornerR,omitempty"`  // corner radius (0 = square)
	NoBorder bool    `json:"noBorder,omitempty"` // true = fill only, no border ring
}

// LabelConfig controls the automatic label drawn by the painter.
// Zero value = label auto-generated from UPPER(Meta.Name) at the top, default styling.
type LabelConfig struct {
	Hidden    bool    `json:"hidden,omitempty"`    // true = no auto-label
	Text      string  `json:"text,omitempty"`      // override label text (default: UPPER(Meta.Name))
	Align     HAlign  `json:"align,omitempty"`     // label alignment (default: HAlignStart)
	FontScale float64 `json:"fontScale,omitempty"` // label font scale (default: 0.12)
	VAlign    VAlign  `json:"vAlign,omitempty"`    // VAlignStart = top (default), VAlignEnd = bottom
}

// WidgetMeta holds the widget type, display name, palette category,
// config schema, and default grid dimensions.
type WidgetMeta struct {
	Type              WidgetType        `json:"type"`
	Name              string            `json:"name"`
	Category          Category          `json:"category"`
	CategoryLabel     string            `json:"categoryLabel"`
	Panel             PanelConfig       `json:"panel,omitempty"`
	Label             LabelConfig       `json:"label,omitempty"`
	ConfigDefs        []ConfigDef       `json:"configDefs,omitempty"`
	DefaultColSpan    int               `json:"defaultColSpan"`
	DefaultRowSpan    int               `json:"defaultRowSpan"`
	IdleCapable       bool              `json:"idleCapable"`
	DefaultUpdateHz   float64           `json:"defaultUpdateHz"`
	DefaultPanelRules []ConditionalRule `json:"defaultPanelRules,omitempty"`
	DefaultDefinition ElementList       `json:"defaultDefinition,omitempty"`
	// CapabilityBinding is an optional binding path (e.g. BindingElectronicsABSAvailable).
	// When set, the painter resolves this path on every frame; if it resolves to
	// false the widget renders a "not available" placeholder instead of live data.
	CapabilityBinding Binding `json:"capabilityBinding,omitempty"`
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
	def := w.Definition(nil)
	if !m.Panel.Disabled {
		panel := Panel{CornerR: m.Panel.CornerR, NoBorder: m.Panel.NoBorder}
		def = append([]Element{panel}, def...)
	}
	if !m.Label.Hidden {
		text := m.Label.Text
		if text == "" {
			text = strings.ToUpper(m.Name)
		}
		fontScale := m.Label.FontScale
		if fontScale == 0 {
			fontScale = 0.12
		}
		lbl := Text{
			Text: text,
			Style: TextStyle{
				Font:     FontFamilyUI,
				FontSize: fontScale,
				HAlign:   m.Label.Align,
				Color:    ColorRefMuted.Expr(),
			},
		}
		// Insert label after panel (if present) or at the start.
		insertAt := 0
		if !m.Panel.Disabled {
			insertAt = 1
		}
		def = append(def[:insertAt], append([]Element{lbl}, def[insertAt:]...)...)
	}
	m.DefaultDefinition = ElementList(def)
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
		totalCs := int64(math.Round(seconds * 100))
		if totalCs <= 0 {
			return "-.---.--"
		}
		m := totalCs / 6000
		rem := totalCs % 6000
		s := rem / 100
		cs := rem % 100
		return fmt.Sprintf("%d:%02d.%02d", m, s, cs)
	case LapFormatSSmmm:
		if seconds <= 0 {
			return "--.---"
		}
		totalMs := int64(math.Round(seconds * 1000))
		if totalMs <= 0 {
			return "--.---"
		}
		return fmt.Sprintf("%.3f", float64(totalMs)/1000.0)
	default: // LapFormatMSSmmm
		if seconds <= 0 {
			return "-.---.---"
		}
		totalMs := int64(math.Round(seconds * 1000))
		if totalMs <= 0 {
			return "-.---.---"
		}
		m := totalMs / 60000
		rem := totalMs % 60000
		s := rem / 1000
		ms := rem % 1000
		return fmt.Sprintf("%d:%02d.%03d", m, s, ms)
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
