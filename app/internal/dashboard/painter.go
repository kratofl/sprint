// Package dashboard paints dashboard images from telemetry data.
// It has no hardware dependency — callers receive an image.Image and decide
// how to deliver it (USB, file, test comparison, etc.).
package dashboard

import (
	"embed"
	"fmt"
	"image"
	"image/color"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
)

//go:embed fonts/*.ttf
var fontsFS embed.FS

// widgetCache holds the last rendered pixels for a widget instance, used to
// blit back onto the canvas when the widget is throttled below the frame rate.
type widgetCache struct {
	img      *image.RGBA
	x, y     int
	lastNano int64
}

// Painter produces a full dashboard image for a given telemetry frame.
type Painter struct {
	width, height int
	fontDir       string
	fontOnce      sync.Once

	// fontFiles caches parsed *opentype.Font per filename (expensive to parse).
	// fontFaces caches the ready-to-use font.Face per "filename@size" key.
	// Both are only accessed from the render goroutine — no mutex required.
	fontFiles map[string]*opentype.Font
	fontFaces map[string]font.Face

	// bgImg is the pre-baked static background (solid ColBg fill).
	// Rendered once on the first frame; copied into ctx at the start of each
	// frame so clearing the canvas does not run every tick.
	bgImg *image.RGBA

	// ctx is the reusable gg.Context. Allocated once per screen size and reset
	// at the start of each frame by blitting bgImg, avoiding a 1.5 MB allocation
	// per tick (800×480 RGBA).
	ctx *gg.Context

	// alert is the currently active parameter-change overlay (not atomic —
	// only accessed from the render goroutine).
	alert    alertState
	prevElec dto.Electronics

	// layout is the user-configured layout.
	layout atomic.Pointer[DashLayout]

	// widgetCaches holds per-widget pixel snapshots for update-rate throttling.
	// Keyed by DashWidget.ID. Only accessed from the render goroutine — no mutex.
	widgetCaches map[string]*widgetCache

	// activePageIndex is the index into layout.Pages to render (0-based).
	activePageIndex atomic.Int32
	// idle indicates whether to render the idle page instead of an active page.
	idle atomic.Bool
}

// NewPainter creates a Painter for the given screen dimensions.
func NewPainter(width, height int) *Painter {
	return &Painter{width: width, height: height}
}

// Dims returns the pixel dimensions of this Painter's canvas.
func (p *Painter) Dims() (int, int) {
	return p.width, p.height
}

// SetLayout atomically sets the layout to use on the next rendered frame.
// Passing nil is a no-op (the caller should always pass a valid layout).
func (p *Painter) SetLayout(layout *DashLayout) {
	if layout == nil {
		p.layout.Store((*DashLayout)(nil))
	} else {
		p.layout.Store(layout)
	}
	p.widgetCaches = nil
}

// SetActivePage sets the active page index (0-based) for the next rendered frame.
// Index is clamped to valid range; out-of-range values silently use page 0.
func (p *Painter) SetActivePage(index int) {
	if index < 0 {
		index = 0
	}
	p.activePageIndex.Store(int32(index))
}

// SetIdle controls whether the idle page is rendered.
// When true, the idle page is shown regardless of active page index.
func (p *Painter) SetIdle(idle bool) {
	p.idle.Store(idle)
}

// Paint renders a complete dashboard image for the given telemetry frame
// using the active layout.
func (p *Painter) Paint(frame *dto.TelemetryFrame) (image.Image, error) {
	p.fontOnce.Do(func() {
		p.extractFonts()
		p.fontFiles = make(map[string]*opentype.Font)
		p.fontFaces = make(map[string]font.Face)
	})
	p.ensureBg()

	dc := p.getContext()

	if layout := p.layout.Load(); layout != nil {
		p.checkAlerts(frame, layout)
		var pageWidgets []DashWidget
		if p.idle.Load() {
			pageWidgets = layout.IdlePage.Widgets
		} else {
			idx := int(p.activePageIndex.Load())
			if idx >= len(layout.Pages) {
				idx = 0
			}
			if len(layout.Pages) > 0 {
				pageWidgets = layout.Pages[idx].Widgets
			}
		}
		for _, widget := range pageWidgets {
			p.dispatchWidget(dc, frame, widget, layout)
		}
		p.applyAlertOverlay(dc, float64(p.width), float64(p.height))
	}

	p.applyFlagOverlay(dc, frame, float64(p.width), float64(p.height))
	return dc.Image(), nil
}

// dispatchWidget converts grid coordinates to pixels and dispatches to the
// registered widget renderer for w.Type. Unknown widget types are silently skipped.
// If the widget's update_rate config is below 30 fps, a pixel cache is used to
// restore the last rendered frame when the interval has not elapsed.
func (p *Painter) dispatchWidget(dc *gg.Context, frame *dto.TelemetryFrame, w DashWidget, layout *DashLayout) {
	cols := layout.GridCols
	rows := layout.GridRows
	if cols <= 0 {
		cols = DefaultGridCols
	}
	if rows <= 0 {
		rows = DefaultGridRows
	}

	cellW := float64(p.width) / float64(cols)
	cellH := float64(p.height) / float64(rows)

	x := float64(w.Col) * cellW
	y := float64(w.Row) * cellH
	pw := float64(w.ColSpan) * cellW
	ph := float64(w.RowSpan) * cellH

	meta, _ := widgets.GetMeta(w.Type)
	hz := widgetUpdateHz(w.Config, meta.DefaultUpdateHz)
	if hz > 0 {
		intervalNano := int64(float64(time.Second) / hz)
		now := time.Now().UnixNano()
		if cache, ok := p.widgetCaches[w.ID]; ok && now-cache.lastNano < intervalNano {
			p.blitCache(dc, cache)
			return
		}
	}

	widgets.Dispatch(w.Type, dc, frame, x, y, pw, ph, p.face, w.Config)

	if hz > 0 {
		p.saveCache(dc, w.ID, int(x), int(y), int(pw), int(ph))
	}
}

// widgetUpdateHz reads update_rate from the widget config, falling back to defaultHz.
func widgetUpdateHz(config map[string]any, defaultHz float64) float64 {
	if config != nil {
		if v, ok := config["update_rate"]; ok {
			switch s := v.(type) {
			case string:
				if hz, err := strconv.ParseFloat(s, 64); err == nil && hz > 0 {
					return hz
				}
			case float64:
				if s > 0 {
					return s
				}
			}
		}
	}
	return defaultHz
}

// blitCache copies the cached widget pixels back onto the canvas.
func (p *Painter) blitCache(dc *gg.Context, cache *widgetCache) {
	if cache.img == nil {
		return
	}
	if dst, ok := dc.Image().(*image.RGBA); ok {
		blitSubImage(dst, cache.img, cache.x, cache.y)
	}
}

// saveCache captures the rendered widget region into the per-widget cache.
func (p *Painter) saveCache(dc *gg.Context, id string, x, y, w, h int) {
	if p.widgetCaches == nil {
		p.widgetCaches = make(map[string]*widgetCache)
	}
	src, ok := dc.Image().(*image.RGBA)
	if !ok {
		return
	}
	cache := p.widgetCaches[id]
	if cache == nil || cache.img == nil || cache.img.Bounds().Dx() != w || cache.img.Bounds().Dy() != h {
		cache = &widgetCache{
			img: image.NewRGBA(image.Rect(0, 0, w, h)),
			x:   x,
			y:   y,
		}
		p.widgetCaches[id] = cache
	}
	captureRegion(cache.img, src, x, y, w, h)
	cache.lastNano = time.Now().UnixNano()
}

// captureRegion copies a w×h region from src starting at (x, y) into dst (0, 0).
func captureRegion(dst, src *image.RGBA, x, y, w, h int) {
	for row := 0; row < h; row++ {
		srcOff := src.PixOffset(x, y+row)
		dstOff := dst.PixOffset(0, row)
		copy(dst.Pix[dstOff:dstOff+w*4], src.Pix[srcOff:srcOff+w*4])
	}
}

// blitSubImage copies src into dst at position (x, y).
func blitSubImage(dst, src *image.RGBA, x, y int) {
	w := src.Bounds().Dx()
	h := src.Bounds().Dy()
	for row := 0; row < h; row++ {
		dstOff := dst.PixOffset(x, y+row)
		srcOff := src.PixOffset(0, row)
		copy(dst.Pix[dstOff:dstOff+w*4], src.Pix[srcOff:srcOff+w*4])
	}
}

// applyFlagOverlay draws the flag status banner over the rendered frame when a flag is active.
func (p *Painter) applyFlagOverlay(dc *gg.Context, frame *dto.TelemetryFrame, w, h float64) {
	if !frame.Flags.Yellow && !frame.Flags.Red && !frame.Flags.SafetyCar {
		return
	}
	var flagCol color.RGBA
	var flagText string
	switch {
	case frame.Flags.Red:
		flagCol, flagText = widgets.ColDanger, "RED FLAG"
	case frame.Flags.SafetyCar:
		flagCol, flagText = widgets.ColWarning, "SAFETY CAR"
	default:
		flagCol, flagText = widgets.ColWarning, "YELLOW FLAG"
	}
	dc.SetRGBA255(int(flagCol.R), int(flagCol.G), int(flagCol.B), 25)
	dc.DrawRectangle(0, 0, w, h)
	dc.Fill()
	dc.SetColor(flagCol)
	dc.DrawRectangle(0, h-30, w, 30)
	dc.Fill()
	p.face(dc, "SpaceGrotesk-Bold.ttf", 14)
	dc.SetColor(widgets.ColBg)
	dc.DrawStringAnchored(flagText, w/2, h-15, 0.5, 0.5)
}

// Drawing helpers.

// ensureBg pre-renders the static background into bgImg once per painter
// lifetime. Subsequent frames blit this image instead of clearing manually.
func (p *Painter) ensureBg() {
	if p.bgImg != nil {
		return
	}
	tmp := gg.NewContext(p.width, p.height)
	tmp.SetColor(widgets.ColBg)
	tmp.Clear()
	src := tmp.Image().(*image.RGBA)
	p.bgImg = image.NewRGBA(src.Rect)
	copy(p.bgImg.Pix, src.Pix)
}

// getContext returns the reusable gg.Context reset to the pre-baked background.
// The same *image.RGBA is reused across frames: the caller converts it to
// RGB565 immediately after Paint returns, so reuse is safe.
func (p *Painter) getContext() *gg.Context {
	if p.ctx == nil {
		p.ctx = gg.NewContext(p.width, p.height)
	}
	if dst, ok := p.ctx.Image().(*image.RGBA); ok && p.bgImg != nil {
		copy(dst.Pix, p.bgImg.Pix)
	} else {
		p.ctx.SetColor(widgets.ColBg)
		p.ctx.Clear()
	}
	return p.ctx
}

// Close removes the temporary font directory and releases cached font faces.
// Safe to call multiple times.
func (p *Painter) Close() {
	if p.fontDir != "" {
		os.RemoveAll(p.fontDir)
		p.fontDir = ""
	}
	for _, f := range p.fontFaces {
		f.Close()
	}
	p.fontFaces = nil
	p.fontFiles = nil
}

// Font management.

// face sets the font face on dc, using a cache to avoid re-parsing the TTF on
// every draw call.
func (p *Painter) face(dc *gg.Context, name string, size float64) {
	key := fmt.Sprintf("%s@%.2f", name, size)
	if f, ok := p.fontFaces[key]; ok {
		dc.SetFontFace(f)
		return
	}

	parsed, ok := p.fontFiles[name]
	if !ok {
		data, err := os.ReadFile(filepath.Join(p.fontDir, name))
		if err != nil {
			return
		}
		parsed, err = opentype.Parse(data)
		if err != nil {
			return
		}
		p.fontFiles[name] = parsed
	}

	face, err := opentype.NewFace(parsed, &opentype.FaceOptions{
		Size:    size,
		DPI:     72,
		Hinting: font.HintingFull,
	})
	if err != nil {
		return
	}
	p.fontFaces[key] = face
	dc.SetFontFace(face)
}

func (p *Painter) extractFonts() {
	dir, err := os.MkdirTemp("", "sprint-fonts-*")
	if err != nil {
		return
	}
	p.fontDir = dir
	entries, _ := fontsFS.ReadDir("fonts")
	for _, e := range entries {
		data, err := fontsFS.ReadFile("fonts/" + e.Name())
		if err != nil {
			continue
		}
		_ = os.WriteFile(filepath.Join(dir, e.Name()), data, 0644)
	}
}

const alertDuration = 1500 * time.Millisecond

// alertState holds the currently active full-screen alert overlay.
type alertState struct {
	text      string
	color     color.RGBA
	expiresAt time.Time
}

// checkAlerts compares the current frame's Electronics against the previous
// frame. When a monitored value changes and the layout enables that alert,
// the active alert is updated. Only the most recent change wins (last write).
// prevElec is always updated so future comparisons stay accurate.
func (p *Painter) checkAlerts(frame *dto.TelemetryFrame, layout *DashLayout) {
	elec := frame.Electronics
	prev := p.prevElec
	now := time.Now()

	if layout.Alerts.TCChange && elec.TC != prev.TC {
		p.alert = alertState{
			text:      fmt.Sprintf("TC  %d", elec.TC),
			color:     widgets.ColTeal,
			expiresAt: now.Add(alertDuration),
		}
	}
	if layout.Alerts.ABSChange && elec.ABS != prev.ABS {
		p.alert = alertState{
			text:      fmt.Sprintf("ABS  %d", elec.ABS),
			color:     widgets.ColWarning,
			expiresAt: now.Add(alertDuration),
		}
	}
	if layout.Alerts.EngineMapChange && elec.MotorMap != prev.MotorMap {
		p.alert = alertState{
			text:      fmt.Sprintf("MAP  %d", elec.MotorMap),
			color:     widgets.ColAccent,
			expiresAt: now.Add(alertDuration),
		}
	}
	p.prevElec = elec
}

// applyAlertOverlay paints a full-screen overlay when an alert is active.
// It renders a semi-transparent dark backdrop, coloured accent bars at the
// top and bottom edges, and large centred text showing the changed parameter.
func (p *Painter) applyAlertOverlay(dc *gg.Context, w, h float64) {
	if p.alert.expiresAt.IsZero() || time.Now().After(p.alert.expiresAt) {
		return
	}

	dc.SetRGBA(0, 0, 0, 0.82)
	dc.DrawRectangle(0, 0, w, h)
	dc.Fill()

	c := p.alert.color
	dc.SetColor(c)
	dc.DrawRectangle(0, 0, w, 10)
	dc.Fill()
	dc.DrawRectangle(0, h-10, w, 10)
	dc.Fill()

	p.face(dc, "JetBrainsMono-Bold.ttf", h*0.28)
	dc.SetColor(color.RGBA{R: c.R, G: c.G, B: c.B, A: 255})
	dc.DrawStringAnchored(p.alert.text, w/2, h/2, 0.5, 0.5)
}
