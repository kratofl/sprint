// Package dashboard defines the dash layout schema, manages layout persistence,
// and paints dashboard images from telemetry data.
// Widget types and rendering logic live in the widgets sub-package.
package dashboard

import (
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/kratofl/sprint/app/internal/dashboard/alerts"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
)

// Grid constants for the default 800×480 screen.
// 20 columns × 12 rows = 40×40 px cells at native resolution.
const (
	DefaultGridCols = 20
	DefaultGridRows = 12
)

// DashWidget is a single widget placed on a dashboard page.
// Col, Row, ColSpan, RowSpan are all in grid units.
type DashWidget struct {
	ID         string                    `json:"id"`
	Type       widgets.WidgetType        `json:"type"`
	Col        int                       `json:"col"`     // 0-based grid column (left edge)
	Row        int                       `json:"row"`     // 0-based grid row (top edge)
	ColSpan    int                       `json:"colSpan"` // width in grid cells (min 1)
	RowSpan    int                       `json:"rowSpan"` // height in grid cells (min 1)
	Config     map[string]any            `json:"config,omitempty"`
	PanelRules []widgets.ConditionalRule `json:"panelRules,omitempty"`
	Style      widgets.WidgetStyle       `json:"style,omitempty"`
}

// DashPage is a single page within a dashboard layout.
type DashPage struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Widgets []DashWidget `json:"widgets"`
}

// DashLayout is the full configuration for one named dashboard.
// It contains an idle page (shown when player is not in a session),
// one or more active pages (cycled via commands), and alert settings.
type DashLayout struct {
	ID                string                `json:"id"`
	Name              string                `json:"name"`
	Default           bool                  `json:"default"`
	GridCols          int                   `json:"gridCols"`
	GridRows          int                   `json:"gridRows"`
	IdlePage          DashPage              `json:"idlePage"`
	Pages             []DashPage            `json:"pages"` // at least 1 required
	Alerts            []alerts.AlertInstance `json:"alerts,omitempty"`
	Theme             widgets.DashTheme     `json:"theme,omitempty"`
	DomainPalette     widgets.DomainPalette `json:"domainPalette,omitempty"`
	FormatPreferences widgets.FormatPreferences `json:"formatPreferences,omitempty"`
}

// NewPage creates a DashPage with a new UUID.
func NewPage(name string) DashPage {
	return DashPage{
		ID:      uuid.NewString(),
		Name:    name,
		Widgets: []DashWidget{},
	}
}

// UnmarshalJSON implements backwards-compatible deserialization for DashLayout.
// Older saved layouts stored "alerts" as an object {"tcChange":false, ...}.
// The field is now []alerts.AlertInstance (an array). We detect the old format
// by inspecting the raw JSON token and silently treat it as an empty slice,
// so existing layouts load cleanly without losing any other fields.
func (l *DashLayout) UnmarshalJSON(data []byte) error {
	// Use a type alias to avoid infinite recursion while still unmarshaling all
	// other fields via the generated logic.
	type Alias DashLayout
	aux := &struct {
		Alerts json.RawMessage `json:"alerts"`
		*Alias
	}{
		Alias: (*Alias)(l),
	}
	if err := json.Unmarshal(data, aux); err != nil {
		return err
	}
	// Old format was an object; new format is an array. Only unmarshal when it
	// is actually a JSON array — otherwise leave Alerts nil (no configured alerts).
	if len(aux.Alerts) > 0 && aux.Alerts[0] == '[' {
		if err := json.Unmarshal(aux.Alerts, &l.Alerts); err != nil {
			l.Alerts = nil
		}
	}
	return nil
}
func ValidateLayout(l *DashLayout) error {
	if l.GridCols <= 0 || l.GridRows <= 0 {
		return fmt.Errorf("dash: invalid grid dimensions %dx%d", l.GridCols, l.GridRows)
	}
	if len(l.Pages) == 0 {
		return fmt.Errorf("dash: layout %q has no active pages", l.Name)
	}
	for pi, page := range l.Pages {
		for wi, w := range page.Widgets {
			if w.Col < 0 || w.Row < 0 || w.ColSpan < 1 || w.RowSpan < 1 {
				return fmt.Errorf("dash: page %d widget %d has invalid grid position/size", pi, wi)
			}
			if w.Col+w.ColSpan > l.GridCols {
				return fmt.Errorf("dash: page %d widget %d exceeds grid columns", pi, wi)
			}
			if w.Row+w.RowSpan > l.GridRows {
				return fmt.Errorf("dash: page %d widget %d exceeds grid rows", pi, wi)
			}
		}
	}
	for wi, w := range l.IdlePage.Widgets {
		if w.Col < 0 || w.Row < 0 || w.ColSpan < 1 || w.RowSpan < 1 {
			return fmt.Errorf("dash: idle page widget %d has invalid grid position/size", wi)
		}
		if w.Col+w.ColSpan > l.GridCols {
			return fmt.Errorf("dash: idle page widget %d exceeds grid columns", wi)
		}
		if w.Row+w.RowSpan > l.GridRows {
			return fmt.Errorf("dash: idle page widget %d exceeds grid rows", wi)
		}
	}
	return nil
}
