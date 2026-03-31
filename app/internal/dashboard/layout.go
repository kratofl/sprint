// Package dashboard defines the dash layout schema, manages layout persistence,
// and paints dashboard images from telemetry data.
// A DashLayout is a list of DashWidgets, each positioned and sized in screen-space
// pixels relative to the VoCore screen's render dimensions.
// Widget types and rendering logic live in the widgets sub-package.
package dashboard

import "github.com/kratofl/sprint/app/internal/dashboard/widgets"

// DashWidget is a single widget placed on the dashboard canvas.
// X, Y, W, H are in screen-space pixels (relative to the VoCore render resolution).
type DashWidget struct {
	// ID is a unique identifier within the layout (UUID string).
	ID string `json:"id"`
	// Type identifies which telemetry widget to render.
	Type widgets.WidgetType `json:"type"`
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
