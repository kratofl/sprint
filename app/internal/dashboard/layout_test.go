package dashboard

import (
	"testing"

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
