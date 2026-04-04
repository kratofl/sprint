package dashboard

import (
	"image"
	"testing"
	"time"

	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
)

func makeTestLayout() *DashLayout {
	return &DashLayout{
		ID:       "painter-test",
		Name:     "Painter Test",
		GridCols: 20,
		GridRows: 12,
		IdlePage: NewPage("Idle"),
		Pages: []DashPage{
			{
				ID:   "p1",
				Name: "Main",
				Widgets: []DashWidget{
					{
						ID:      "w1",
						Type:    widgets.WidgetSpeed,
						Col:     5,
						Row:     3,
						ColSpan: 4,
						RowSpan: 2,
					},
				},
			},
		},
	}
}

func TestPainterGridToPixel(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	frame := &dto.TelemetryFrame{}
	img, err := painter.Paint(frame)
	if err != nil {
		t.Fatalf("Paint returned error: %v", err)
	}
	if img == nil {
		t.Fatal("Paint returned nil image")
	}
	bounds := img.Bounds()
	if bounds.Dx() != 800 {
		t.Errorf("image width: want 800, got %d", bounds.Dx())
	}
	if bounds.Dy() != 480 {
		t.Errorf("image height: want 480, got %d", bounds.Dy())
	}
	if _, ok := img.(image.Image); !ok {
		t.Error("result is not image.Image")
	}
}

func TestPainterNilLayout(t *testing.T) {
	painter := NewPainter(400, 240)
	defer painter.Close()

	frame := &dto.TelemetryFrame{}
	img, err := painter.Paint(frame)
	if err != nil {
		t.Fatalf("Paint with nil layout returned error: %v", err)
	}
	if img == nil {
		t.Fatal("Paint with nil layout returned nil image")
	}
}

func TestPainterIdlePage(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	layout.IdlePage.Widgets = []DashWidget{
		{ID: "iw1", Type: widgets.WidgetFlags, Col: 0, Row: 0, ColSpan: 4, RowSpan: 2},
	}
	painter.SetLayout(layout)
	painter.SetIdle(true)

	frame := &dto.TelemetryFrame{}
	img, err := painter.Paint(frame)
	if err != nil {
		t.Fatalf("Paint in idle mode returned error: %v", err)
	}
	if img == nil {
		t.Fatal("Paint in idle mode returned nil image")
	}
}

func TestPainterAlertDetection(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	layout.Alerts.TCChange = true
	painter.SetLayout(layout)
	painter.SetIdle(false)

	// Frame 1: TC=3 baseline. Copy pixels before the context is reused.
	frame1 := &dto.TelemetryFrame{}
	frame1.Electronics.TC = 3
	rawImg1, err := painter.Paint(frame1)
	if err != nil {
		t.Fatalf("Paint frame1 error: %v", err)
	}
	// Copy pixel data from the reusable buffer so frame2 doesn't overwrite it.
	var pix1 []byte
	if rgba, ok := rawImg1.(*image.RGBA); ok {
		pix1 = make([]byte, len(rgba.Pix))
		copy(pix1, rgba.Pix)
	}

	// Frame 2: TC=5 triggers alert overlay.
	frame2 := &dto.TelemetryFrame{}
	frame2.Electronics.TC = 5
	rawImg2, err := painter.Paint(frame2)
	if err != nil {
		t.Fatalf("Paint frame2 error: %v", err)
	}

	// Alert should be active after frame2 — verify overlay is non-expired.
	if painter.alert.expiresAt.IsZero() {
		t.Error("expected alert to be set after TC change")
	}
	if time.Now().After(painter.alert.expiresAt) {
		t.Error("alert should not have expired immediately")
	}

	// The two frames should differ (alert overlay changes pixels).
	if pix1 == nil {
		t.Skip("image is not *image.RGBA — cannot compare pixels")
	}
	rgba2, ok := rawImg2.(*image.RGBA)
	if !ok {
		t.Skip("image2 is not *image.RGBA — cannot compare pixels")
	}
	if len(pix1) != len(rgba2.Pix) {
		t.Fatal("image buffers have different size")
	}
	var differs bool
	for i := range pix1 {
		if pix1[i] != rgba2.Pix[i] {
			differs = true
			break
		}
	}
	if !differs {
		t.Error("expected alert overlay to change pixels, but frames are identical")
	}
}

func TestPainterSetActivePage(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	layout.Pages = append(layout.Pages, DashPage{
		ID:      "p2",
		Name:    "Page2",
		Widgets: []DashWidget{},
	})
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(1)

	frame := &dto.TelemetryFrame{}
	if _, err := painter.Paint(frame); err != nil {
		t.Fatalf("Paint page 1: %v", err)
	}

	// Out-of-range index should not panic (falls back to page 0).
	painter.SetActivePage(99)
	if _, err := painter.Paint(frame); err != nil {
		t.Fatalf("Paint out-of-range page: %v", err)
	}
}
