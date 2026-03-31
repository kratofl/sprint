// Package dash defines the dash layout schema and manages layout persistence.
// A DashLayout is a list of DashWidgets, each positioned and sized in screen-space
// pixels relative to the VoCore screen's render dimensions.
package dash

// WidgetType is the canonical identifier for a dashboard widget kind.
type WidgetType string

const (
	WidgetLapTime    WidgetType = "lap_time"
	WidgetSector     WidgetType = "sector"
	WidgetDelta      WidgetType = "delta"
	WidgetSpeed      WidgetType = "speed"
	WidgetGear       WidgetType = "gear"
	WidgetRPMBar     WidgetType = "rpm_bar"
	WidgetFuel       WidgetType = "fuel"
	WidgetTyreTemp   WidgetType = "tyre_temp"
	WidgetInputTrace WidgetType = "input_trace"
)

// WidgetLabel is a human-readable display name for each widget type.
var WidgetLabel = map[WidgetType]string{
	WidgetLapTime:    "Lap Time",
	WidgetSector:     "Sector",
	WidgetDelta:      "Delta",
	WidgetSpeed:      "Speed",
	WidgetGear:       "Gear",
	WidgetRPMBar:     "RPM Bar",
	WidgetFuel:       "Fuel",
	WidgetTyreTemp:   "Tyre Temp",
	WidgetInputTrace: "Inputs",
}

// WidgetCategory groups widget types for the editor palette.
var WidgetCategory = map[string][]WidgetType{
	"Timing": {WidgetLapTime, WidgetSector, WidgetDelta},
	"Car":    {WidgetSpeed, WidgetGear, WidgetRPMBar, WidgetInputTrace},
	"Race":   {WidgetFuel, WidgetTyreTemp},
}

// DashWidget is a single widget placed on the dashboard canvas.
// X, Y, W, H are in screen-space pixels (relative to the VoCore render resolution).
type DashWidget struct {
	// ID is a unique identifier within the layout (UUID string).
	ID string `json:"id"`
	// Type identifies which telemetry widget to render.
	Type WidgetType `json:"type"`
	// X is the left edge of the widget in pixels.
	X int `json:"x"`
	// Y is the top edge of the widget in pixels.
	Y int `json:"y"`
	// W is the widget width in pixels.
	W int `json:"w"`
	// H is the widget height in pixels.
	H int `json:"h"`
}

// DashLayout is the full set of widgets for one dashboard screen.
type DashLayout struct {
	// Widgets is the ordered list of widgets to render (back to front).
	Widgets []DashWidget `json:"widgets"`
}
