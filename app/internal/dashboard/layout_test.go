package dashboard

import (
	"encoding/json"
	"strings"
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
			"alerts":[
				{"id":"a1","type":"tc_change"},
				{"id":"a2","type":"abs_change"},
				{"id":"a3","type":"enginemap_change"}
			]
		}`
		var l DashLayout
		if err := json.Unmarshal([]byte(raw), &l); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got, want := len(l.Alerts), 3; got != want {
			t.Fatalf("expected %d parsed alerts, got %d", want, got)
		}
		if l.Alerts[0].ID != "a1" || l.Alerts[0].Type != alerts.AlertTypeTC {
			t.Fatalf("expected first alert to remain tc_change, got %#v", l.Alerts[0])
		}
		if l.Alerts[1].ID != "a2" || l.Alerts[1].Type != alerts.AlertTypeABS {
			t.Fatalf("expected second alert to remain abs_change, got %#v", l.Alerts[1])
		}
		if l.Alerts[2].ID != "a3" || l.Alerts[2].Type != alerts.AlertTypeEngineMap {
			t.Fatalf("expected third alert to remain enginemap_change, got %#v", l.Alerts[2])
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

func TestNewPageUsesCompactID(t *testing.T) {
	page := NewPage("Main")

	if !strings.HasPrefix(page.ID, "page_") {
		t.Fatalf("expected page id to use compact page_ prefix, got %q", page.ID)
	}
	if strings.Contains(page.ID, "-") {
		t.Fatalf("expected page id to avoid UUID hyphens, got %q", page.ID)
	}
	if got, want := len(page.ID), len("page_")+8; got != want {
		t.Fatalf("expected compact page id length %d, got %d (%q)", want, got, page.ID)
	}
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

	t.Run("wrapper groups within bounds pass", func(t *testing.T) {
		l := validLayout()
		l.Pages[0].WrapperGroups = []DashWrapperGroup{
			{
				ID:               "wrap-1",
				Name:             "Stack",
				Col:              8,
				Row:              0,
				ColSpan:          4,
				RowSpan:          3,
				DefaultVariantID: "variant-a",
				Variants: []DashWrapperVariant{
					{
						ID:   "variant-a",
						Name: "A",
						Widgets: []DashWidget{
							{ID: "inner", Type: widgets.WidgetText, Col: 0, Row: 0, ColSpan: 4, RowSpan: 3},
						},
					},
				},
			},
		}
		if err := ValidateLayout(l); err != nil {
			t.Fatalf("expected wrapper layout to validate, got %v", err)
		}
	})

	t.Run("page widget overlapping wrapper group fails", func(t *testing.T) {
		l := validLayout()
		l.Pages[0].WrapperGroups = []DashWrapperGroup{
			{
				ID:               "wrap-1",
				Name:             "Stack",
				Col:              2,
				Row:              0,
				ColSpan:          4,
				RowSpan:          3,
				DefaultVariantID: "variant-a",
				Variants: []DashWrapperVariant{
					{ID: "variant-a", Name: "A", Widgets: []DashWidget{{ID: "inner", Type: widgets.WidgetText, Col: 0, Row: 0, ColSpan: 4, RowSpan: 3}}},
				},
			},
		}
		if err := ValidateLayout(l); err == nil {
			t.Fatal("expected overlap between page widget and wrapper group to fail")
		}
	})

	t.Run("wrapper group child exceeding group bounds fails", func(t *testing.T) {
		l := validLayout()
		l.Pages[0].WrapperGroups = []DashWrapperGroup{
			{
				ID:               "wrap-1",
				Name:             "Stack",
				Col:              8,
				Row:              0,
				ColSpan:          4,
				RowSpan:          3,
				DefaultVariantID: "variant-a",
				Variants: []DashWrapperVariant{
					{
						ID:   "variant-a",
						Name: "A",
						Widgets: []DashWidget{
							{ID: "inner", Type: widgets.WidgetText, Col: 2, Row: 0, ColSpan: 3, RowSpan: 3},
						},
					},
				},
			},
		}
		if err := ValidateLayout(l); err == nil {
			t.Fatal("expected child widget exceeding wrapper bounds to fail")
		}
	})

	t.Run("overlapping wrapper groups fail", func(t *testing.T) {
		l := validLayout()
		l.Pages[0].Widgets = nil
		l.Pages[0].WrapperGroups = []DashWrapperGroup{
			{
				ID:               "wrap-1",
				Name:             "Stack A",
				Col:              0,
				Row:              0,
				ColSpan:          4,
				RowSpan:          3,
				DefaultVariantID: "variant-a",
				Variants: []DashWrapperVariant{
					{ID: "variant-a", Name: "A", Widgets: []DashWidget{{ID: "inner-a", Type: widgets.WidgetText, Col: 0, Row: 0, ColSpan: 4, RowSpan: 3}}},
				},
			},
			{
				ID:               "wrap-2",
				Name:             "Stack B",
				Col:              3,
				Row:              1,
				ColSpan:          4,
				RowSpan:          3,
				DefaultVariantID: "variant-b",
				Variants: []DashWrapperVariant{
					{ID: "variant-b", Name: "B", Widgets: []DashWidget{{ID: "inner-b", Type: widgets.WidgetText, Col: 0, Row: 0, ColSpan: 4, RowSpan: 3}}},
				},
			},
		}
		if err := ValidateLayout(l); err == nil {
			t.Fatal("expected overlapping wrapper groups to fail")
		}
	})
}
