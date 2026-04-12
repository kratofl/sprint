package dashboard

import (
	"encoding/json"
	"testing"

	"github.com/kratofl/sprint/app/internal/dashboard/alerts"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
)

func validLayout() *DashLayout {
	return &DashLayout{
		ID:       "test-id",
		Name:     "Test",
		GridCols: DefaultGridCols,
		GridRows: DefaultGridRows,
		IdlePage: NewPage("Idle"),
		Pages: []DashPage{
			{
				ID:   "page1",
				Name: "Main",
				Widgets: []DashWidget{
					{ID: "w1", Type: widgets.WidgetSpeed, Col: 0, Row: 0, ColSpan: 4, RowSpan: 2},
				},
			},
		},
	}
}

func TestDashLayoutUnmarshalAlerts(t *testing.T) {
	t.Run("legacy object alerts silently ignored", func(t *testing.T) {
		raw := `{
			"id":"x","name":"X","gridCols":20,"gridRows":12,
			"idlePage":{"id":"i","name":"Idle","widgets":[]},
			"pages":[{"id":"p","name":"P","widgets":[]}],
			"alerts":{"tcChange":false,"absChange":false,"engineMapChange":false}
		}`
		var l DashLayout
		if err := json.Unmarshal([]byte(raw), &l); err != nil {
			t.Fatalf("expected no error for legacy alerts object, got %v", err)
		}
		if len(l.Alerts) != 0 {
			t.Fatalf("expected empty Alerts slice, got %v", l.Alerts)
		}
	})

	t.Run("new array alerts parsed", func(t *testing.T) {
		raw := `{
			"id":"x","name":"X","gridCols":20,"gridRows":12,
			"idlePage":{"id":"i","name":"Idle","widgets":[]},
			"pages":[{"id":"p","name":"P","widgets":[]}],
			"alerts":[{"id":"a1","type":"tc_change"}]
		}`
		var l DashLayout
		if err := json.Unmarshal([]byte(raw), &l); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(l.Alerts) != 1 || l.Alerts[0].Type != alerts.AlertTypeTC {
			t.Fatalf("expected 1 TC alert, got %v", l.Alerts)
		}
	})

	t.Run("null alerts treated as empty", func(t *testing.T) {
		raw := `{
			"id":"x","name":"X","gridCols":20,"gridRows":12,
			"idlePage":{"id":"i","name":"Idle","widgets":[]},
			"pages":[{"id":"p","name":"P","widgets":[]}]
		}`
		var l DashLayout
		if err := json.Unmarshal([]byte(raw), &l); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if l.Alerts != nil {
			t.Fatalf("expected nil Alerts, got %v", l.Alerts)
		}
	})
}

func TestValidateLayout(t *testing.T) {
	t.Run("valid layout passes", func(t *testing.T) {
		l := validLayout()
		if err := ValidateLayout(l); err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	})

	t.Run("zero pages fails", func(t *testing.T) {
		l := validLayout()
		l.Pages = nil
		if err := ValidateLayout(l); err == nil {
			t.Fatal("expected error for 0 pages, got nil")
		}
	})

	t.Run("widget exceeding gridCols fails", func(t *testing.T) {
		l := validLayout()
		l.Pages[0].Widgets = []DashWidget{
			{ID: "w1", Type: widgets.WidgetSpeed, Col: 18, Row: 0, ColSpan: 4, RowSpan: 1},
		}
		if err := ValidateLayout(l); err == nil {
			t.Fatal("expected error for widget exceeding cols, got nil")
		}
	})

	t.Run("widget with negative col fails", func(t *testing.T) {
		l := validLayout()
		l.Pages[0].Widgets = []DashWidget{
			{ID: "w1", Type: widgets.WidgetSpeed, Col: -1, Row: 0, ColSpan: 4, RowSpan: 1},
		}
		if err := ValidateLayout(l); err == nil {
			t.Fatal("expected error for negative col, got nil")
		}
	})

	t.Run("idle page widget bounds checked", func(t *testing.T) {
		l := validLayout()
		l.IdlePage.Widgets = []DashWidget{
			{ID: "w1", Type: widgets.WidgetFlags, Col: 17, Row: 0, ColSpan: 5, RowSpan: 1},
		}
		if err := ValidateLayout(l); err == nil {
			t.Fatal("expected error for idle widget exceeding cols, got nil")
		}
	})

	t.Run("invalid grid dimensions fails", func(t *testing.T) {
		l := validLayout()
		l.GridCols = 0
		if err := ValidateLayout(l); err == nil {
			t.Fatal("expected error for zero gridCols, got nil")
		}
	})

	t.Run("widget exceeding gridRows fails", func(t *testing.T) {
		l := validLayout()
		l.Pages[0].Widgets = []DashWidget{
			{ID: "w1", Type: widgets.WidgetSpeed, Col: 0, Row: 11, ColSpan: 1, RowSpan: 3},
		}
		if err := ValidateLayout(l); err == nil {
			t.Fatal("expected error for widget exceeding rows, got nil")
		}
	})
}
