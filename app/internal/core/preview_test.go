package core

import (
	"io"
	"log/slog"
	"testing"

	"github.com/kratofl/sprint/app/internal/core/dashboard"
	"github.com/kratofl/sprint/app/internal/core/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
)

func TestPreviewHonorsGlobalFormatPreferences(t *testing.T) {
	var pngs []string
	emit := func(name string, args ...any) {
		if name == previewEventName && len(args) == 1 {
			if ev, ok := args[0].(DashPreviewEvent); ok {
				pngs = append(pngs, ev.PNG)
			}
		}
	}
	preview := newPreviewService(slog.New(slog.NewTextHandler(io.Discard, nil)), emit)
	preview.ensurePainter()

	layout := dashboard.DashLayout{
		ID: "prev", Name: "Prev", GridCols: 20, GridRows: 12,
		IdlePage: dashboard.NewPage("Idle"),
		Pages: []dashboard.DashPage{{
			ID:   "p1",
			Name: "Main",
			Widgets: []dashboard.DashWidget{
				{ID: "speed", Type: widgets.WidgetSpeed, Col: 0, Row: 0, ColSpan: 8, RowSpan: 4},
			},
		}},
	}
	preview.layout.Store(&layout)
	preview.latestFrame.Store(&dto.TelemetryFrame{Car: dto.CarState{SpeedMS: 50}})

	preview.renderAndEmit() // default units (kph)
	preview.ApplyRenderPreferences(dashboard.RenderPreferences{
		FormatPrefs: widgets.FormatPreferences{SpeedUnit: widgets.SpeedMPH},
	})
	preview.renderAndEmit() // mph

	if len(pngs) != 2 {
		t.Fatalf("expected 2 emitted previews, got %d", len(pngs))
	}
	if pngs[0] == pngs[1] {
		t.Fatalf("preview render unchanged when global format prefs changed — units ignored")
	}
}
