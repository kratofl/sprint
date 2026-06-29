package dashboard

import (
	"bytes"
	"image"
	"image/color"
	"math"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kratofl/sprint/app/internal/core/dashboard/alerts"
	"github.com/kratofl/sprint/app/internal/core/dashboard/widgets"
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
	layout.Alerts = []alerts.AlertInstance{{ID: uuid.NewString(), Type: alerts.AlertTypeTC}}
	painter.SetLayout(layout)
	painter.SetIdle(false)

	// Frame 1: TC=3 baseline. Copy pixels before the context is reused.
	frame1 := &dto.TelemetryFrame{}
	frame1.Electronics.TC = 3
	frame1.Electronics.TCAvailable = true
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
	frame2.Electronics.TCAvailable = true
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

func TestPainterCanvasIsFixedPureBlackRegardlessOfTheme(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	layout.Pages[0].Widgets = nil
	// A non-black theme background and an explicit page background must both be
	// ignored: the on-wheel canvas is fixed to opaque #000000 (PRD #12, #46).
	layout.Theme = widgets.DashTheme{Bg: color.RGBA{R: 40, G: 60, B: 90, A: 255}}
	layout.Pages[0].Background = &color.RGBA{R: 200, G: 25, B: 25, A: 255}
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	img, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint returned error: %v", err)
	}
	got := color.RGBAModel.Convert(img.At(0, 0)).(color.RGBA)
	want := color.RGBA{R: 0, G: 0, B: 0, A: 255}
	if got != want {
		t.Fatalf("canvas pixel: want fixed pure black %#v, got %#v", want, got)
	}
}

func TestPainterStandardWidgetHasNoSurfaceElevation(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	blank := DashWidget{ID: "blank", Type: widgets.WidgetText, Col: 4, Row: 3, ColSpan: 8, RowSpan: 4,
		Config: map[string]any{"content": ""}}
	layout.Pages[0].Widgets = []DashWidget{blank}
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	img, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint returned error: %v", err)
	}
	left, top, right, bottom := widgetPixelBounds(20, 12, 800, 480, blank)
	got := color.RGBAModel.Convert(img.At((left+right)/2, (top+bottom)/2)).(color.RGBA)
	want := color.RGBA{R: 0, G: 0, B: 0, A: 255}
	if got != want {
		t.Fatalf("standard widget interior: want pure black (no elevation) %#v, got %#v", want, got)
	}
}

func TestPainterWidgetBackgroundOverrideRemainsAvailable(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	override := color.RGBA{R: 200, G: 30, B: 30, A: 255}
	layout := makeTestLayout()
	tinted := DashWidget{ID: "tinted", Type: widgets.WidgetText, Col: 4, Row: 3, ColSpan: 8, RowSpan: 4,
		Config: map[string]any{"content": ""},
		Style:  widgets.WidgetStyle{Background: &override}}
	layout.Pages[0].Widgets = []DashWidget{tinted}
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	img, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint returned error: %v", err)
	}
	left, top, right, bottom := widgetPixelBounds(20, 12, 800, 480, tinted)
	got := color.RGBAModel.Convert(img.At((left+right)/2, (top+bottom)/2)).(color.RGBA)
	if got != override {
		t.Fatalf("explicit widget background override should still fill: want %#v, got %#v", override, got)
	}
}

func TestPainterWidgetPanelHasRoundedCorners(t *testing.T) {
	// Standard widgets read as rounded instruments: the extreme corner is rounded
	// away (canvas black) while the straight edge still carries the outline. (PRD #2/#6)
	w := DashWidget{ID: "rounded", Type: widgets.WidgetText, Col: 3, Row: 1, ColSpan: 6, RowSpan: 4,
		Config: map[string]any{"content": ""}}
	layout := makeTestLayout()
	layout.Pages[0].Widgets = []DashWidget{w}
	painter := NewPainter(800, 480)
	defer painter.Close()
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	raw, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint returned error: %v", err)
	}
	img := raw.(*image.RGBA)
	left, top, right, bottom := widgetPixelBounds(20, 12, 800, 480, w)

	if got := color.RGBAModel.Convert(img.At(left, top)).(color.RGBA); got != (color.RGBA{R: 0, G: 0, B: 0, A: 255}) {
		t.Fatalf("expected rounded (black) corner at (%d,%d), got %#v", left, top, got)
	}
	if got := color.RGBAModel.Convert(img.At(right-1, top+(bottom-top)/2)).(color.RGBA); got != widgets.ColorInstrumentOutline {
		t.Fatalf("expected outline at straight edge midpoint, got %#v", got)
	}
}

func TestPainterWidgetBorderOverride(t *testing.T) {
	// A Text widget draws a border by default; a per-instance Border=false override
	// must remove it (leaving the fixed black surface), and the default (no override)
	// must still draw the outline. (PRD #7/#8)
	off := false
	mk := func(style widgets.WidgetStyle) (*image.RGBA, DashWidget) {
		w := DashWidget{ID: "bordered", Type: widgets.WidgetText, Col: 3, Row: 1, ColSpan: 4, RowSpan: 3,
			Config: map[string]any{"content": ""}, Style: style}
		layout := makeTestLayout()
		layout.Pages[0].Widgets = []DashWidget{w}
		painter := NewPainter(800, 480)
		defer painter.Close()
		painter.SetLayout(layout)
		painter.SetIdle(false)
		painter.SetActivePage(0)
		raw, err := painter.Paint(&dto.TelemetryFrame{})
		if err != nil {
			t.Fatalf("Paint returned error: %v", err)
		}
		return raw.(*image.RGBA), w
	}

	imgDefault, w := mk(widgets.WidgetStyle{})
	_, top, right, bottom := widgetPixelBounds(20, 12, 800, 480, w)
	x, y := right-1, top+(bottom-top)/2
	if got := color.RGBAModel.Convert(imgDefault.At(x, y)).(color.RGBA); got != widgets.ColorInstrumentOutline {
		t.Fatalf("default border: want %#v at right edge, got %#v", widgets.ColorInstrumentOutline, got)
	}

	imgNoBorder, _ := mk(widgets.WidgetStyle{Border: &off})
	got := color.RGBAModel.Convert(imgNoBorder.At(x, y)).(color.RGBA)
	if got == widgets.ColorInstrumentOutline {
		t.Fatalf("Border=false override should remove the outline, but border pixel is still present")
	}
	if got != (color.RGBA{R: 0, G: 0, B: 0, A: 255}) {
		t.Fatalf("disabled-border widget edge: want pure black, got %#v", got)
	}
}

func TestPainterPageBackgroundOverrideIsIgnored(t *testing.T) {
	// Retired behavior: a per-page Background once tinted the canvas. The canvas is
	// now fixed to opaque #000000, so the override must be ignored. (PRD #12)
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	layout.Pages[0].Background = &color.RGBA{R: 200, G: 25, B: 25, A: 255}
	layout.Pages[0].Widgets = nil
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	img, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint returned error: %v", err)
	}

	got := color.RGBAModel.Convert(img.At(0, 0)).(color.RGBA)
	want := color.RGBA{R: 0, G: 0, B: 0, A: 255}
	if got != want {
		t.Fatalf("expected fixed black canvas %#v despite page background, got %#v", want, got)
	}
}

func TestPainterPageBackgroundIgnoresGlobalTheme(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	layout.Pages[0].Widgets = nil
	painter.SetGlobalTheme(widgets.DashTheme{
		Bg: color.RGBA{R: 33, G: 44, B: 55, A: 255},
	})

	got := painter.pageBackground(layout, layout.Pages[0])
	want := widgets.FixedCanvasBackground
	if got != want {
		t.Fatalf("expected fixed canvas background %#v regardless of theme, got %#v", want, got)
	}
}

func TestPainterApplyRenderPreferencesAppliesGlobalTheme(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	layout.Pages[0].Widgets = nil
	// The canvas no longer reflects theme colours, so verify the in-progress
	// ApplyRenderPreferences plumbing via a still-themeable channel: the accent.
	accent := color.RGBA{R: 33, G: 144, B: 255, A: 255}
	painter.ApplyRenderPreferences(RenderPreferences{
		Theme: widgets.DashTheme{Accent: accent},
	})

	got := painter.resolvedTheme(layout).Accent
	if got != accent {
		t.Fatalf("expected ApplyRenderPreferences to apply accent %#v, got %#v", accent, got)
	}
}

func TestPainterApplyRenderPreferencesMatchesIndividualSetters(t *testing.T) {
	// A layout that surfaces several preference groups at once: a profile.*
	// text binding (Profile), a speed widget (FormatPrefs unit label), and a TC
	// widget (DomainPalette), over a global theme + typography. If
	// ApplyRenderPreferences drops any field, the two renders diverge.
	buildLayout := func() *DashLayout {
		layout := makeTestLayout()
		layout.Pages[0].Widgets = []DashWidget{
			{ID: "name", Type: widgets.WidgetText, Col: 0, Row: 0, ColSpan: 8, RowSpan: 2,
				Config: map[string]any{"content": "Name", "binding": "profile.driverName"}},
			{ID: "speed", Type: widgets.WidgetSpeed, Col: 8, Row: 0, ColSpan: 6, RowSpan: 3},
			{ID: "tc", Type: widgets.WidgetTC, Col: 14, Row: 0, ColSpan: 4, RowSpan: 3},
		}
		return layout
	}

	prefs := RenderPreferences{
		Theme:         widgets.DashTheme{Bg: color.RGBA{R: 12, G: 24, B: 36, A: 255}},
		DomainPalette: widgets.DomainPalette{TC: color.RGBA{R: 200, G: 30, B: 90, A: 255}},
		FormatPrefs:   widgets.FormatPreferences{SpeedUnit: widgets.SpeedMPH},
		Typography:    widgets.TypographySettings{FontScale: 1.3},
		Profile:       RenderProfile{DriverName: "Alice"},
	}

	frame := &dto.TelemetryFrame{}

	individual := NewPainter(800, 480)
	defer individual.Close()
	individual.SetLayout(buildLayout())
	individual.SetActivePage(0)
	individual.SetIdle(false)
	individual.SetGlobalTheme(prefs.Theme)
	individual.SetGlobalDomainPalette(prefs.DomainPalette)
	individual.SetGlobalPrefs(prefs.FormatPrefs)
	individual.SetGlobalTypography(prefs.Typography)
	individual.SetThemeLibrary(prefs.ThemeLibrary)
	individual.SetProfile(prefs.Profile)
	wantRaw, err := individual.Paint(frame)
	if err != nil {
		t.Fatalf("individual Paint: %v", err)
	}
	want := append([]byte(nil), wantRaw.(*image.RGBA).Pix...)

	bundled := NewPainter(800, 480)
	defer bundled.Close()
	bundled.SetLayout(buildLayout())
	bundled.SetActivePage(0)
	bundled.SetIdle(false)
	bundled.ApplyRenderPreferences(prefs)
	gotRaw, err := bundled.Paint(frame)
	if err != nil {
		t.Fatalf("bundled Paint: %v", err)
	}
	got := gotRaw.(*image.RGBA).Pix

	if !bytes.Equal(got, want) {
		t.Fatalf("ApplyRenderPreferences render differs from individual setters: a field was dropped")
	}
}

func TestPainterPreservesPanelRightBorderOnFractionalGridWidths(t *testing.T) {
	const (
		screenW = 854
		screenH = 480
		cols    = 20
		rows    = 12
	)
	widget := DashWidget{
		ID:      "fractional-panel",
		Type:    widgets.WidgetText,
		Col:     3,
		Row:     1,
		ColSpan: 2,
		RowSpan: 2,
		Config:  map[string]any{"content": ""},
	}
	layout := &DashLayout{
		ID:       "fractional-grid",
		Name:     "Fractional Grid",
		GridCols: cols,
		GridRows: rows,
		IdlePage: NewPage("Idle"),
		Pages: []DashPage{{
			ID:      "p1",
			Name:    "Main",
			Widgets: []DashWidget{widget},
		}},
	}
	painter := NewPainter(screenW, screenH)
	defer painter.Close()
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	raw, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint returned error: %v", err)
	}
	img, ok := raw.(*image.RGBA)
	if !ok {
		t.Fatalf("expected RGBA image, got %T", raw)
	}

	rightEdgeX := int(math.Round(float64(widget.Col+widget.ColSpan)*float64(screenW)/float64(cols))) - 1
	topY := int(math.Round(float64(widget.Row) * float64(screenH) / float64(rows)))
	bottomY := int(math.Round(float64(widget.Row+widget.RowSpan) * float64(screenH) / float64(rows)))
	midY := topY + (bottomY-topY)/2
	got := color.RGBAModel.Convert(img.At(rightEdgeX, midY)).(color.RGBA)
	if got != widgets.ColorInstrumentOutline {
		t.Fatalf("expected right border pixel at (%d,%d) to be %#v, got %#v", rightEdgeX, midY, widgets.ColorInstrumentOutline, got)
	}
}

func TestPainterPreservesRightBordersInStackedDefaultLayout(t *testing.T) {
	// Widgets that keep a framed panel (gear/speed/rpm and the badge widgets are now
	// open instruments and intentionally borderless, so they are not asserted here).
	widgetsUnderTest := []DashWidget{
		{ID: "laptime", Type: widgets.WidgetLapTime, Col: 8, Row: 1, ColSpan: 4, RowSpan: 6},
		{ID: "gap", Type: widgets.WidgetGap, Col: 8, Row: 7, ColSpan: 4, RowSpan: 1},
		{ID: "delta", Type: widgets.WidgetDelta, Col: 8, Row: 8, ColSpan: 4, RowSpan: 2},
		{ID: "energy", Type: widgets.WidgetEnergy, Col: 8, Row: 10, ColSpan: 4, RowSpan: 2},
		{ID: "position", Type: widgets.WidgetPosition, Col: 0, Row: 0, ColSpan: 2, RowSpan: 1},
	}
	layout := &DashLayout{
		ID:       "stacked-default",
		Name:     "Stacked Default",
		GridCols: 20,
		GridRows: 12,
		IdlePage: NewPage("Idle"),
		Pages: []DashPage{{
			ID:   "p1",
			Name: "Main",
			Widgets: []DashWidget{
				{ID: "rpm", Type: widgets.WidgetRPM, Col: 8, Row: 0, ColSpan: 4, RowSpan: 1},
				{ID: "abs", Type: widgets.WidgetABS, Col: 6, Row: 4, ColSpan: 2, RowSpan: 2},
				{ID: "tc1", Type: widgets.WidgetTC, Col: 4, Row: 4, ColSpan: 2, RowSpan: 2},
				{ID: "tc2", Type: widgets.WidgetTC, Col: 4, Row: 6, ColSpan: 2, RowSpan: 2},
				{ID: "tc3", Type: widgets.WidgetTC, Col: 6, Row: 6, ColSpan: 2, RowSpan: 2},
				{ID: "incidents", Type: widgets.WidgetIncidents, Col: 12, Row: 0, ColSpan: 3, RowSpan: 1},
				{ID: "flags", Type: widgets.WidgetFlags, Col: 5, Row: 0, ColSpan: 3, RowSpan: 1},
				{ID: "delta", Type: widgets.WidgetDelta, Col: 12, Row: 1, ColSpan: 8, RowSpan: 3},
				{ID: "lap", Type: widgets.WidgetLapCounter, Col: 18, Row: 0, ColSpan: 2, RowSpan: 1},
				{ID: "brake", Type: widgets.WidgetBrakeBias, Col: 0, Row: 4, ColSpan: 3, RowSpan: 2},
				{ID: "lap-time", Type: widgets.WidgetLapTime, Col: 0, Row: 1, ColSpan: 8, RowSpan: 3},
			},
		}},
	}
	layout.Pages[0].Widgets = append(widgetsUnderTest, layout.Pages[0].Widgets...)

	painter := NewPainter(800, 480)
	defer painter.Close()
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	raw, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint returned error: %v", err)
	}
	img, ok := raw.(*image.RGBA)
	if !ok {
		t.Fatalf("expected RGBA image, got %T", raw)
	}

	for _, widget := range widgetsUnderTest {
		_, _, right, bottom := widgetPixelBounds(layout.GridCols, layout.GridRows, 800, 480, widget)
		_, top, _, _ := widgetPixelBounds(layout.GridCols, layout.GridRows, 800, 480, widget)
		x := right - 1
		y := top + (bottom-top)/2
		got := color.RGBAModel.Convert(img.At(x, y)).(color.RGBA)
		if got != widgets.ColorInstrumentOutline {
			t.Fatalf("%s right border pixel at (%d,%d): want %#v, got %#v", widget.ID, x, y, widgets.ColorInstrumentOutline, got)
		}
	}
}

func TestPainterGearWidgetCentersVisibleGlyphHorizontally(t *testing.T) {
	for _, scenario := range []struct {
		name    string
		screenW int
		screenH int
		cols    int
		rows    int
		widget  DashWidget
	}{
		{
			name:    "live-canvas",
			screenW: 800,
			screenH: 480,
			cols:    20,
			rows:    12,
			widget: DashWidget{
				ID:      "gear",
				Type:    widgets.WidgetGear,
				Col:     8,
				Row:     1,
				ColSpan: 4,
				RowSpan: 6,
			},
		},
		{
			name:    "widget-preview",
			screenW: 144,
			screenH: 144,
			cols:    1,
			rows:    1,
			widget: DashWidget{
				ID:      "gear",
				Type:    widgets.WidgetGear,
				Col:     0,
				Row:     0,
				ColSpan: 1,
				RowSpan: 1,
			},
		},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			layout := &DashLayout{
				ID:       "gear-center",
				Name:     "Gear Center",
				GridCols: scenario.cols,
				GridRows: scenario.rows,
				IdlePage: NewPage("Idle"),
				Pages: []DashPage{{
					ID:      "p1",
					Name:    "Main",
					Widgets: []DashWidget{scenario.widget},
				}},
			}
			painter := NewPainter(scenario.screenW, scenario.screenH)
			defer painter.Close()
			painter.SetLayout(layout)
			painter.SetIdle(false)
			painter.SetActivePage(0)

			left, top, right, bottom := widgetPixelBounds(scenario.cols, scenario.rows, scenario.screenW, scenario.screenH, scenario.widget)
			for _, tc := range []struct {
				name string
				gear int8
			}{
				{name: "reverse", gear: -1},
				{name: "neutral", gear: 0},
				{name: "first", gear: 1},
				{name: "third", gear: 3},
				{name: "eighth", gear: 8},
			} {
				t.Run(tc.name, func(t *testing.T) {
					painter.widgetCaches = nil
					frame := &dto.TelemetryFrame{}
					frame.Car.Gear = tc.gear
					raw, err := painter.Paint(frame)
					if err != nil {
						t.Fatalf("Paint returned error: %v", err)
					}
					img, ok := raw.(*image.RGBA)
					if !ok {
						t.Fatalf("expected RGBA image, got %T", raw)
					}

					widgetCenter := float64(left+right) / 2
					massCenter, ok := foregroundInkHorizontalCenterOfMass(img, image.Rect(left, top, right, bottom))
					if !ok {
						t.Fatal("expected gear foreground pixel mass")
					}
					if diff := math.Abs(massCenter - widgetCenter); diff > 3.5 {
						t.Fatalf("gear visible glyph mass center = %.2f, widget center = %.2f, diff %.2fpx", massCenter, widgetCenter, diff)
					}
				})
			}
		})
	}
}

func foregroundInkHorizontalCenterOfMass(img *image.RGBA, bounds image.Rectangle) (float64, bool) {
	var weightedX, total float64
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c := color.RGBAModel.Convert(img.At(x, y)).(color.RGBA)
			if c.R <= 180 || c.G <= 180 || c.B <= 180 || c.A == 0 {
				continue
			}
			weight := (float64(c.R) + float64(c.G) + float64(c.B)) / 3
			weightedX += (float64(x) + 0.5) * weight
			total += weight
		}
	}
	if total == 0 {
		return 0, false
	}
	return weightedX / total, true
}

func widgetPixelBounds(cols, rows, screenW, screenH int, widget DashWidget) (left, top, right, bottom int) {
	left = int(math.Round(float64(widget.Col) * float64(screenW) / float64(cols)))
	right = int(math.Round(float64(widget.Col+widget.ColSpan) * float64(screenW) / float64(cols)))
	top = int(math.Round(float64(widget.Row) * float64(screenH) / float64(rows)))
	bottom = int(math.Round(float64(widget.Row+widget.RowSpan) * float64(screenH) / float64(rows)))
	return left, top, right, bottom
}

func TestPainterResolvedDomainPaletteUsesGlobalDomainWhenLayoutHasNoOverride(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	painter.SetGlobalDomainPalette(widgets.DomainPalette{
		TC: color.RGBA{R: 90, G: 12, B: 33, A: 255},
	})

	domain := painter.resolvedDomainPalette(layout)
	want := color.RGBA{R: 90, G: 12, B: 33, A: 255}
	if domain.TC != want {
		t.Fatalf("expected global TC color %#v, got %#v", want, domain.TC)
	}
	if domain.Motor != widgets.DefaultDomainPalette().Motor {
		t.Fatalf("expected unspecified domain colors to inherit defaults, got %#v", domain.Motor)
	}
}

func TestPainterProfileBindingFallsBackAndUsesProfileValue(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	layout.IdlePage.Widgets = []DashWidget{
		{
			ID:      "idle-name",
			Type:    widgets.WidgetText,
			Col:     4,
			Row:     3,
			ColSpan: 12,
			RowSpan: 3,
			Config: map[string]any{
				"content": "Your Name",
				"binding": "profile.driverName",
			},
		},
	}
	painter.SetLayout(layout)
	painter.SetIdle(true)

	rawFallback, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint fallback frame: %v", err)
	}
	fallback, ok := rawFallback.(*image.RGBA)
	if !ok {
		t.Fatalf("expected RGBA image, got %T", rawFallback)
	}
	fallbackPix := append([]byte(nil), fallback.Pix...)

	painter.SetProfile(RenderProfile{DriverName: "Alice"})
	rawProfile, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint profile frame: %v", err)
	}
	profileImg, ok := rawProfile.(*image.RGBA)
	if !ok {
		t.Fatalf("expected RGBA image, got %T", rawProfile)
	}

	if len(fallbackPix) != len(profileImg.Pix) {
		t.Fatalf("pixel length mismatch: %d vs %d", len(fallbackPix), len(profileImg.Pix))
	}
	same := true
	for i := range fallbackPix {
		if fallbackPix[i] != profileImg.Pix[i] {
			same = false
			break
		}
	}
	if same {
		t.Fatal("expected profile-bound text to differ from fallback content when profile is set")
	}
}

func TestPainterWrapperGroupRendersSelectedVariant(t *testing.T) {
	painter := NewPainter(800, 480)
	defer painter.Close()

	layout := makeTestLayout()
	layout.Pages[0].Widgets = nil
	layout.Pages[0].WidgetStacks = []DashWidgetStack{
		{
			ID:             "stack",
			Name:           "Stack",
			Col:            4,
			Row:            3,
			ColSpan:        8,
			RowSpan:        3,
			DefaultLayerID: "variant-a",
			Layers: []DashWidgetStackLayer{
				{
					ID:   "variant-a",
					Name: "A",
					Widgets: []DashWidget{
						{ID: "inner-a", Type: widgets.WidgetText, Col: 0, Row: 0, ColSpan: 8, RowSpan: 3, Config: map[string]any{"content": "VARIANT_A"}},
					},
				},
				{
					ID:   "variant-b",
					Name: "B",
					Widgets: []DashWidget{
						{ID: "inner-b", Type: widgets.WidgetText, Col: 0, Row: 0, ColSpan: 8, RowSpan: 3, Config: map[string]any{"content": "VARIANT_B"}},
					},
				},
			},
		},
	}
	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	rawVariantA, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint variant A: %v", err)
	}
	imgA, ok := rawVariantA.(*image.RGBA)
	if !ok {
		t.Fatalf("expected RGBA image, got %T", rawVariantA)
	}
	pixA := append([]byte(nil), imgA.Pix...)

	painter.SetWidgetStackLayer(layout.Pages[0].ID, "stack", "variant-b")
	rawVariantB, err := painter.Paint(&dto.TelemetryFrame{})
	if err != nil {
		t.Fatalf("Paint variant B: %v", err)
	}
	imgB, ok := rawVariantB.(*image.RGBA)
	if !ok {
		t.Fatalf("expected RGBA image, got %T", rawVariantB)
	}

	if len(pixA) != len(imgB.Pix) {
		t.Fatalf("pixel length mismatch: %d vs %d", len(pixA), len(imgB.Pix))
	}
	same := true
	for i := range pixA {
		if pixA[i] != imgB.Pix[i] {
			same = false
			break
		}
	}
	if same {
		t.Fatal("expected selected wrapper variant to change rendered pixels")
	}
}
