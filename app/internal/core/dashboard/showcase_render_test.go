package dashboard

import (
	"image/png"
	"os"
	"testing"

	"github.com/kratofl/sprint/app/internal/core/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
)

// TestRenderShowcase renders a representative dashboard to a PNG so the redesign
// can be inspected visually. Gated behind RENDER_SHOWCASE so it never runs in CI.
//
//	RENDER_SHOWCASE=1 SHOWCASE_OUT=/path/to/out.png go test ./internal/core/dashboard/ -run TestRenderShowcase
func TestRenderShowcase(t *testing.T) {
	if os.Getenv("RENDER_SHOWCASE") == "" {
		t.Skip("set RENDER_SHOWCASE=1 to render the showcase PNG")
	}
	out := os.Getenv("SHOWCASE_OUT")
	if out == "" {
		out = "showcase.png"
	}

	w := func(id string, typ widgets.WidgetType, col, row, cs, rs int) DashWidget {
		return DashWidget{ID: id, Type: typ, Col: col, Row: row, ColSpan: cs, RowSpan: rs}
	}

	layout := &DashLayout{
		ID: "showcase", Name: "Showcase", GridCols: 20, GridRows: 12,
		IdlePage: NewPage("Idle"),
		Pages: []DashPage{{
			ID: "p1", Name: "Main",
			Widgets: []DashWidget{
				w("laptime", widgets.WidgetLapTime, 0, 0, 6, 3),
				w("delta", widgets.WidgetDelta, 0, 3, 6, 3),
				w("energy", widgets.WidgetEnergy, 0, 6, 6, 3),
				w("fuel", widgets.WidgetFuel, 0, 9, 6, 3),
				w("rpm", widgets.WidgetRPM, 6, 0, 8, 2),
				w("tc", widgets.WidgetTC, 6, 3, 2, 3),
				w("abs", widgets.WidgetABS, 6, 6, 2, 3),
				w("gear", widgets.WidgetGear, 8, 3, 4, 6),
				w("enginemap", widgets.WidgetEngineMap, 12, 3, 2, 3),
				w("brakebias", widgets.WidgetBrakeBias, 12, 6, 2, 3),
				w("speed", widgets.WidgetSpeed, 8, 9, 4, 3),
				w("gap", widgets.WidgetGap, 14, 0, 6, 3),
				w("position", widgets.WidgetPosition, 14, 3, 3, 3),
				w("incidents", widgets.WidgetIncidents, 17, 3, 3, 3),
				w("lapcounter", widgets.WidgetLapCounter, 12, 9, 8, 3),
			},
		}},
	}

	painter := NewPainter(800, 480)
	defer painter.Close()
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	frame := &dto.TelemetryFrame{}
	frame.Car.Gear = 4
	frame.Car.SpeedMS = 59 // ~213 km/h
	frame.Car.RPM = 8450
	frame.Car.MaxRPM = 9200
	frame.Electronics.TC = 3
	frame.Electronics.TCAvailable = true
	frame.Electronics.ABS = 2
	frame.Electronics.ABSAvailable = true
	frame.Electronics.MotorMap = 5
	frame.Electronics.MotorMapAvailable = true
	frame.Car.Fuel = 42.5

	img, err := painter.Paint(frame)
	if err != nil {
		t.Fatalf("Paint: %v", err)
	}
	f, err := os.Create(out)
	if err != nil {
		t.Fatalf("create %s: %v", out, err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatalf("encode: %v", err)
	}
	t.Logf("wrote showcase to %s", out)
}
