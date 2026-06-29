// Package dashboard defines the dash layout schema, manages layout persistence,
// and paints dashboard images from telemetry data.
// Widget types and rendering logic live in the widgets sub-package.
package dashboard

import (
	"encoding/json"
	"fmt"
	"image/color"

	"github.com/kratofl/sprint/app/internal/core/dashboard/alerts"
	"github.com/kratofl/sprint/app/internal/core/dashboard/widgets"
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
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	Background   *color.RGBA       `json:"background,omitempty"`
	Widgets      []DashWidget      `json:"widgets"`
	WidgetStacks []DashWidgetStack `json:"widgetStacks,omitempty"`
}

// DashWidgetStackLayer is one named layer inside a widget stack.
// Child widget coordinates are relative to the group bounds.
type DashWidgetStackLayer struct {
	ID      string       `json:"id"`
	Name    string       `json:"name"`
	Widgets []DashWidget `json:"widgets"`
}

// DashWidgetStack is a page-local rectangular region that can render one of
// multiple named widget layers at a time.
type DashWidgetStack struct {
	ID             string                 `json:"id"`
	Name           string                 `json:"name"`
	Col            int                    `json:"col"`
	Row            int                    `json:"row"`
	ColSpan        int                    `json:"colSpan"`
	RowSpan        int                    `json:"rowSpan"`
	DefaultLayerID string                 `json:"defaultLayerId,omitempty"`
	Layers         []DashWidgetStackLayer `json:"layers"`
}

// DashLayout is the full configuration for one named dashboard.
// It contains an idle page (shown when player is not in a session),
// one or more active pages (cycled via commands), and alert settings.
type DashLayout struct {
	ID                string                     `json:"id"`
	Name              string                     `json:"name"`
	Default           bool                       `json:"default"`
	GridCols          int                        `json:"gridCols"`
	GridRows          int                        `json:"gridRows"`
	IdlePage          DashPage                   `json:"idlePage"`
	Pages             []DashPage                 `json:"pages"` // at least 1 required
	// Alerts is the retired per-instance alert list, retained for migration of
	// legacy dashboards into AlertConfig. New dashboards use AlertConfig only.
	Alerts      []alerts.AlertInstance `json:"alerts,omitempty"`
	AlertConfig alerts.AlertConfig     `json:"alertConfig,omitempty"`
	ThemeID           string                     `json:"themeId,omitempty"` // references a ThemePreset; empty = global default
	Theme             widgets.DashTheme          `json:"theme,omitempty"`
	DomainPalette     widgets.DomainPalette      `json:"domainPalette,omitempty"`
	Typography        widgets.TypographySettings `json:"typography,omitempty"`
	FormatPreferences widgets.FormatPreferences  `json:"formatPreferences,omitempty"`
}

func (p *DashPage) UnmarshalJSON(data []byte) error {
	type Alias DashPage
	aux := &struct {
		WrapperGroups []DashWidgetStack `json:"wrapperGroups"`
		*Alias
	}{
		Alias: (*Alias)(p),
	}
	if err := json.Unmarshal(data, aux); err != nil {
		return err
	}
	if len(p.WidgetStacks) == 0 && len(aux.WrapperGroups) > 0 {
		p.WidgetStacks = aux.WrapperGroups
	}
	return nil
}

func (s *DashWidgetStack) UnmarshalJSON(data []byte) error {
	type Alias DashWidgetStack
	aux := &struct {
		DefaultVariantID string                 `json:"defaultVariantId"`
		Variants         []DashWidgetStackLayer `json:"variants"`
		*Alias
	}{
		Alias: (*Alias)(s),
	}
	if err := json.Unmarshal(data, aux); err != nil {
		return err
	}
	if s.DefaultLayerID == "" && aux.DefaultVariantID != "" {
		s.DefaultLayerID = aux.DefaultVariantID
	}
	if len(s.Layers) == 0 && len(aux.Variants) > 0 {
		s.Layers = aux.Variants
	}
	return nil
}

// NewPage creates a DashPage with a compact page ID.
func NewPage(name string) DashPage {
	return DashPage{
		ID:      newDashID("page"),
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
		if err := validatePage(l, page, fmt.Sprintf("page %d", pi)); err != nil {
			return err
		}
	}
	if err := validatePage(l, l.IdlePage, "idle page"); err != nil {
		return err
	}
	return nil
}

func validatePage(layout *DashLayout, page DashPage, label string) error {
	for wi, w := range page.Widgets {
		if err := validateWidgetBounds(w, layout.GridCols, layout.GridRows); err != nil {
			return fmt.Errorf("dash: %s widget %d %w", label, wi, err)
		}
	}
	for gi, stack := range page.WidgetStacks {
		if err := validateWidgetStackBounds(stack, layout.GridCols, layout.GridRows); err != nil {
			return fmt.Errorf("dash: %s widget stack %d %w", label, gi, err)
		}
		for wi := range page.Widgets {
			if widgetsOverlap(page.Widgets[wi], DashWidget{Col: stack.Col, Row: stack.Row, ColSpan: stack.ColSpan, RowSpan: stack.RowSpan}) {
				return fmt.Errorf("dash: %s widget stack %d overlaps page widget %d", label, gi, wi)
			}
		}
		for gj := gi + 1; gj < len(page.WidgetStacks); gj++ {
			other := page.WidgetStacks[gj]
			if widgetsOverlap(
				DashWidget{Col: stack.Col, Row: stack.Row, ColSpan: stack.ColSpan, RowSpan: stack.RowSpan},
				DashWidget{Col: other.Col, Row: other.Row, ColSpan: other.ColSpan, RowSpan: other.RowSpan},
			) {
				return fmt.Errorf("dash: %s widget stack %d overlaps widget stack %d", label, gi, gj)
			}
		}
	}
	return nil
}

func validateWidgetBounds(w DashWidget, cols, rows int) error {
	if w.Col < 0 || w.Row < 0 || w.ColSpan < 1 || w.RowSpan < 1 {
		return fmt.Errorf("has invalid grid position/size")
	}
	if w.Col+w.ColSpan > cols {
		return fmt.Errorf("exceeds grid columns")
	}
	if w.Row+w.RowSpan > rows {
		return fmt.Errorf("exceeds grid rows")
	}
	return nil
}

func validateWidgetStackBounds(stack DashWidgetStack, cols, rows int) error {
	if stack.Col < 0 || stack.Row < 0 || stack.ColSpan < 1 || stack.RowSpan < 1 {
		return fmt.Errorf("has invalid grid position/size")
	}
	if stack.Col+stack.ColSpan > cols {
		return fmt.Errorf("exceeds grid columns")
	}
	if stack.Row+stack.RowSpan > rows {
		return fmt.Errorf("exceeds grid rows")
	}
	if len(stack.Layers) == 0 {
		return fmt.Errorf("must contain at least one layer")
	}
	defaultFound := stack.DefaultLayerID == ""
	for li, layer := range stack.Layers {
		if stack.DefaultLayerID != "" && layer.ID == stack.DefaultLayerID {
			defaultFound = true
		}
		for wi, w := range layer.Widgets {
			if err := validateWidgetBounds(w, stack.ColSpan, stack.RowSpan); err != nil {
				return fmt.Errorf("layer %d widget %d %w", li, wi, err)
			}
		}
	}
	if !defaultFound {
		return fmt.Errorf("default layer %q not found", stack.DefaultLayerID)
	}
	return nil
}

func widgetsOverlap(a, b DashWidget) bool {
	return a.Col < b.Col+b.ColSpan &&
		a.Col+a.ColSpan > b.Col &&
		a.Row < b.Row+b.RowSpan &&
		a.Row+a.RowSpan > b.Row
}
