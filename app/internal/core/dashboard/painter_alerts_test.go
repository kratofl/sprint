package dashboard

import (
	"image"
	"image/color"
	"testing"
	"time"

	"github.com/kratofl/sprint/app/internal/core/dashboard/alerts"
	"github.com/kratofl/sprint/app/internal/core/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
)

// paintTCAlert arms the shared alert config, then drives a TC1 change (3 → 5) so
// the tc_change alert fires, returning the rendered frame.
func paintTCAlert(t *testing.T, cfg alerts.AlertConfig) *image.RGBA {
	t.Helper()
	layout := makeTestLayout()
	layout.Pages[0].Widgets = nil
	cfg.EnabledTypes = append(cfg.EnabledTypes, alerts.AlertTypeTC)
	layout.AlertConfig = cfg

	painter := NewPainter(800, 480)
	t.Cleanup(painter.Close)
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	baseline := &dto.TelemetryFrame{}
	baseline.Electronics.TC = 3
	baseline.Electronics.TCAvailable = true
	if _, err := painter.Paint(baseline); err != nil {
		t.Fatalf("paint baseline: %v", err)
	}

	trigger := &dto.TelemetryFrame{}
	trigger.Electronics.TC = 5
	trigger.Electronics.TCAvailable = true
	raw, err := painter.Paint(trigger)
	if err != nil {
		t.Fatalf("paint trigger: %v", err)
	}
	return raw.(*image.RGBA)
}

func pixel(img *image.RGBA, x, y int) color.RGBA {
	return color.RGBAModel.Convert(img.At(x, y)).(color.RGBA)
}

var black = color.RGBA{R: 0, G: 0, B: 0, A: 255}

func TestPainterAlertFullNormalFillsScreenWithSemanticColour(t *testing.T) {
	img := paintTCAlert(t, alerts.AlertConfig{DisplayMode: alerts.AlertDisplayFull, ColorMode: alerts.AlertColorNormal})
	semantic := widgets.DefaultDomainPalette().TC
	// A point away from the centred text shows the semantic fill across the whole screen.
	if got := pixel(img, 5, 240); got != semantic {
		t.Fatalf("Full×Normal: want semantic fill %#v at screen edge, got %#v", semantic, got)
	}
}

func TestPainterAlertFullInvertedFillsBlack(t *testing.T) {
	img := paintTCAlert(t, alerts.AlertConfig{DisplayMode: alerts.AlertDisplayFull, ColorMode: alerts.AlertColorInverted})
	if got := pixel(img, 5, 240); got != black {
		t.Fatalf("Full×Inverted: want black fill at screen edge, got %#v", got)
	}
	// The semantic colour must still appear somewhere (the text/iconography).
	if !hasColor(img, widgets.DefaultDomainPalette().TC) {
		t.Fatalf("Full×Inverted: expected semantic-coloured text somewhere on screen")
	}
}

func TestPainterAlertMiddleNormalLeavesDashboardVisible(t *testing.T) {
	img := paintTCAlert(t, alerts.AlertConfig{DisplayMode: alerts.AlertDisplayMiddle, ColorMode: alerts.AlertColorNormal})
	// Corner shows the dashboard (black), not the alert: Middle does not cover the screen.
	if got := pixel(img, 5, 240); got != black {
		t.Fatalf("Middle: expected dashboard (black) at corner, got %#v", got)
	}
	// The centred instrument is filled with the semantic colour (sampled above the text).
	semantic := widgets.DefaultDomainPalette().TC
	if got := pixel(img, 400, 172); got != semantic {
		t.Fatalf("Middle×Normal: want semantic instrument fill %#v, got %#v", semantic, got)
	}
}

func TestPainterAlertMiddleInvertedRendersBlackInstrumentWithSemanticDetail(t *testing.T) {
	img := paintTCAlert(t, alerts.AlertConfig{DisplayMode: alerts.AlertDisplayMiddle, ColorMode: alerts.AlertColorInverted})
	if got := pixel(img, 5, 240); got != black {
		t.Fatalf("Middle: expected dashboard (black) at corner, got %#v", got)
	}
	// Instrument interior is black in inverted mode...
	if got := pixel(img, 400, 172); got != black {
		t.Fatalf("Middle×Inverted: want black instrument interior, got %#v", got)
	}
	// ...but the semantic outline/text must still render (image is not all black).
	if !hasNonBlackPixel(img) {
		t.Fatalf("Middle×Inverted: expected a visible semantic outline/text, but frame is all black")
	}
}

func TestPainterAlertExpiresBackToDashboard(t *testing.T) {
	layout := makeTestLayout()
	layout.Pages[0].Widgets = nil
	painter := NewPainter(800, 480)
	t.Cleanup(painter.Close)
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	// An alert armed in the past must not draw — the dashboard returns after expiry.
	painter.alert = alertState{
		text:        "TC1  5",
		color:       widgets.DefaultDomainPalette().TC,
		displayMode: alerts.AlertDisplayFull,
		colorMode:   alerts.AlertColorNormal,
		expiresAt:   time.Now().Add(-time.Second),
	}
	raw, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("paint: %v", err)
	}
	if got := pixel(raw.(*image.RGBA), 5, 240); got != black {
		t.Fatalf("expired alert: expected dashboard (black), got %#v", got)
	}
}

func hasColor(img *image.RGBA, want color.RGBA) bool {
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if pixel(img, x, y) == want {
				return true
			}
		}
	}
	return false
}

func hasNonBlackPixel(img *image.RGBA) bool {
	b := img.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if p := pixel(img, x, y); p.R != 0 || p.G != 0 || p.B != 0 {
				return true
			}
		}
	}
	return false
}
