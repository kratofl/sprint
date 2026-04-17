// Package dashboard paints dashboard images from telemetry data.
// It has no hardware dependency — callers receive an image.Image and decide
// how to deliver it (USB, file, test comparison, etc.).
package dashboard

import (
	"embed"
	"image"
	"image/color"
	"math"
	"strconv"
	"strings"
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

	// bgImg is the pre-baked static background (solid ColorBackground fill).
	// Rendered once on the first frame; copied into ctx at the start of each
	// frame so clearing the canvas does not run every tick.
	bgImg *image.RGBA

	// ctx is the reusable gg.Context. Allocated once per screen size and reset
	// at the start of each frame by blitting bgImg, avoiding a 1.5 MB allocation
	// per tick (800×480 RGBA).
	ctx *gg.Context

	// alert is the currently active parameter-change overlay (not atomic —
	// only accessed from the render goroutine).
	alert     alertState
	prevFrame *dto.TelemetryFrame

	// layout is the user-configured layout.
	layout atomic.Pointer[DashLayout]

	// widgetCaches holds per-widget pixel snapshots for update-rate throttling.
	// Keyed by DashWidget.ID. Only accessed from the render goroutine — no mutex.
	widgetCaches map[string]*widgetCache

	// globalPrefs holds the user's global-level format preferences. These sit
	// between the compile-time defaults and any per-layout overrides so that a
	// global setting change is immediately reflected across all layouts unless
	// a layout has an explicit override for that field.
	globalPrefs atomic.Pointer[widgets.FormatPreferences]

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

// SetGlobalPrefs stores the global-level FormatPreferences applied as the base
// layer under per-layout overrides. Call whenever the user saves global dash
// settings so all active painters reflect the change immediately.
func (p *Painter) SetGlobalPrefs(prefs widgets.FormatPreferences) {
	p.globalPrefs.Store(&prefs)
}

// emptyFrame is a shared zero-value frame used when no game is connected.
var emptyFrame dto.TelemetryFrame

// Paint renders a complete dashboard image for the given telemetry frame
// using the active layout. A nil frame is treated as a zero-value frame so
// widgets display placeholder/default values when no game is connected.
func (p *Painter) Paint(frame *dto.TelemetryFrame) (image.Image, error) {
	if frame == nil {
		frame = &emptyFrame
	}
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

	widget, ok := widgets.Get(w.Type)
	if !ok {
		return
	}

	meta := widget.Meta()
	hz := widgetUpdateHz(w.Config, meta.DefaultUpdateHz)

	cache := p.getOrCreateCache(w.ID, int(x), int(y), int(pw), int(ph))
	if hz > 0 {
		intervalNano := int64(float64(time.Second) / hz)
		now := time.Now().UnixNano()
		if cache.lastNano != 0 && now-cache.lastNano < intervalNano {
			p.blitCache(dc, cache)
			return
		}
	}

	theme := layout.Theme
	if theme == (widgets.DashTheme{}) {
		theme = widgets.DefaultTheme()
	}

	rt := widgets.RenderTheme{
		Theme:  theme,
		Domain: layout.DomainPalette,
		Style:  w.Style,
	}

	// Resolve FormatPreferences: global settings → layout-level overrides → widget config overrides.
	base := widgets.DefaultFormatPreferences()
	if gp := p.globalPrefs.Load(); gp != nil {
		base = widgets.MergeFormatPreferences(base, *gp)
	}
	layoutPrefs := widgets.MergeFormatPreferences(base, layout.FormatPreferences)
	prefs := widgets.MergeFormatPreferences(layoutPrefs, widgets.FormatPreferencesFromConfig(w.Config))
	elems := widget.Definition(w.Config)

	// Auto-prepend panel element from meta unless disabled.
	if !meta.Panel.Disabled {
		panel := widgets.Element{Kind: widgets.ElemPanel, CornerR: meta.Panel.CornerR, NoBorder: meta.Panel.NoBorder}
		elems = append([]widgets.Element{panel}, elems...)
	}

	// Auto-prepend header element from meta unless disabled.
	if !meta.Header.Disabled {
		text := meta.Header.Text
		if text == "" {
			text = strings.ToUpper(meta.Label)
		}
		align := meta.Header.Align
		fontScale := meta.Header.FontScale
		if fontScale == 0 {
			fontScale = 0.12
		}
		header := widgets.Element{
			Kind:      widgets.ElemText,
			Zone:      "header",
			Text:      text,
			Font:      widgets.FontLabel,
			FontScale: fontScale,
			HAlign:    align,
			Color:     widgets.ColorExpr{Ref: widgets.ColorRefMuted},
		}
		insertAt := 0
		if !meta.Panel.Disabled {
			insertAt = 1
		}
		elems = append(elems[:insertAt], append([]widgets.Element{header}, elems[insertAt:]...)...)
	}

	// Capability gate: if the widget declares a CapabilityBinding and the frame
	// resolves it to false, render a static "not available" placeholder instead.
	if meta.CapabilityBinding != "" {
		if val, ok := widgets.Resolve(frame, meta.CapabilityBinding); ok {
			if available, _ := val.(bool); !available {
				naHeaderAlign := widgets.HAlignCenter
				for _, e := range elems {
					if e.Kind == widgets.ElemText && e.Zone == "header" {
						naHeaderAlign = e.HAlign
						break
					}
				}
				naElems := []widgets.Element{
					{Kind: widgets.ElemPanel},
					{Kind: widgets.ElemText, Text: strings.ToUpper(meta.Label), Font: widgets.FontLabel, FontScale: 0.18,
						Zone: "header", HAlign: naHeaderAlign, VAlign: widgets.VAlignCenter,
						Color: widgets.ColorExpr{Ref: widgets.ColorRefMuted}},
					{Kind: widgets.ElemText, Text: "—", Font: widgets.FontNumber, FontScale: 0.45,
						Zone: "fill", HAlign: widgets.HAlignCenter, VAlign: widgets.VAlignCenter,
						Color: widgets.ColorExpr{Ref: widgets.ColorRefMuted}},
				}
				cache.ctx.SetColor(widgets.ColorBackground)
				cache.ctx.Clear()
				p.renderElements(cache.ctx, frame, rt, prefs, 0, 0, pw, ph, naElems)
				p.blitCache(dc, cache)
				if hz > 0 {
					cache.lastNano = time.Now().UnixNano()
				}
				return
			}
		}
	}

	if len(w.PanelRules) > 0 {
		if col, alpha := evalPanelRules(frame, w.PanelRules); col != "" {
			for i := range elems {
				if elems[i].Kind == widgets.ElemPanel {
					elems[i].FillColor = col
					elems[i].FillAlpha = alpha
					break
				}
			}
		}
	}
	// Clear the widget sub-context to background colour, then render at (0,0).
	// The rendered pixels are blitted onto the main canvas at the widget's
	// absolute position. This replaces the previous dc.Clip() approach which
	// allocated a 384 KB image.Alpha per widget per frame, causing severe GC
	// pressure and progressive FPS degradation after several laps.
	cache.ctx.SetColor(widgets.ColorBackground)
	cache.ctx.Clear()
	p.renderElements(cache.ctx, frame, rt, prefs, 0, 0, pw, ph, elems)
	p.blitCache(dc, cache)

	if hz > 0 {
		cache.lastNano = time.Now().UnixNano()
	}
}

// evalPanelRules evaluates a list of ConditionalRules against the telemetry frame
// and returns the first matching color and alpha. Returns ("", 0) when no rule matches.
func evalPanelRules(frame *dto.TelemetryFrame, rules []widgets.ConditionalRule) (widgets.ColorRef, float64) {
	for _, r := range rules {
		val, ok := widgets.Resolve(frame, r.Property)
		if !ok {
			continue
		}
		f, _ := widgets.ToFloat64(val)
		var match bool
		switch r.Op {
		case widgets.RuleOpGT:
			match = f > r.Threshold
		case widgets.RuleOpLT:
			match = f < r.Threshold
		case widgets.RuleOpGTE:
			match = f >= r.Threshold
		case widgets.RuleOpLTE:
			match = f <= r.Threshold
		case widgets.RuleOpEQ:
			match = f == r.Threshold
		case widgets.RuleOpNEQ:
			match = f != r.Threshold
		}
		if match {
			alpha := r.Alpha
			if alpha == 0 {
				alpha = 0.35
			}
			return r.Color, alpha
		}
	}
	return "", 0
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

// renderElements renders a slice of elements within the widget bounding box.
func (p *Painter) renderElements(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elems []widgets.Element) {
	fillRowCount := countFillRows(elems)
	for _, e := range elems {
		p.renderElement(dc, frame, rt, prefs, x, y, w, h, e, fillRowCount)
	}
}

// renderElement renders a single element within the widget bounding box.
func (p *Painter) renderElement(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Element, fillRowCount int) {
	switch elem.Kind {
	case widgets.ElemPanel:
		p.renderPanel(dc, rt, x, y, w, h, elem)
	case widgets.ElemText:
		p.renderText(dc, frame, rt, prefs, x, y, w, h, elem, fillRowCount)
	case widgets.ElemDot:
		p.renderDot(dc, frame, rt, prefs, x, y, w, h, elem)
	case widgets.ElemHBar:
		p.renderHBar(dc, frame, rt, prefs, x, y, w, h, elem)
	case widgets.ElemDeltaBar:
		p.renderDeltaBar(dc, frame, rt, prefs, x, y, w, h, elem)
	case widgets.ElemSegBar:
		p.renderSegBar(dc, frame, rt, prefs, x, y, w, h, elem)
	case widgets.ElemGrid:
		p.renderGrid(dc, frame, rt, prefs, x, y, w, h, elem)
	case widgets.ElemCondition:
		p.renderCondition(dc, frame, rt, prefs, x, y, w, h, elem)
	}
}

// renderPanel draws the widget background (border + fill) plus an optional FillColor overlay.
func (p *Painter) renderPanel(dc *gg.Context, rt widgets.RenderTheme, x, y, w, h float64, elem widgets.Element) {
	if elem.FillColor != "" && elem.FillAlpha > 0 {
		fc := rt.Resolve(elem.FillColor)
		dc.SetRGBA255(int(fc.R), int(fc.G), int(fc.B), int(elem.FillAlpha*255))
		dc.DrawRectangle(x, y, w, h)
		dc.Fill()
	}
	if !elem.NoBorder {
		painterDrawPanel(dc, x, y, w, h, elem.CornerR, 1)
	}
}

func halignFrac(a widgets.HAlign) float64 {
	switch a {
	case widgets.HAlignCenter:
		return 0.5
	case widgets.HAlignEnd:
		return 1
	default:
		return 0
	}
}

func valignFrac(a widgets.VAlign) float64 {
	switch a {
	case widgets.VAlignCenter:
		return 0.5
	case widgets.VAlignEnd:
		return 1
	default:
		return 0
	}
}

const defaultFillYFrac = 0.5

// fillZoneYs returns the Y fractions for n fill:N rows within the fill zone.
// Distributions are tuned so common widget layouts (label+value, 3-row tables)
// match the original hand-tuned X/Y positions.
func fillZoneYs(n int) []float64 {
	switch n {
	case 1:
		return []float64{defaultFillYFrac}
	case 2:
		return []float64{0.38, 0.72}
	case 3:
		return []float64{0.30, 0.52, 0.74}
	case 4:
		return []float64{0.20, 0.40, 0.60, 0.80}
	default:
		ys := make([]float64, n)
		for i := range ys {
			ys[i] = 0.18 + 0.64*float64(i)/float64(n-1)
		}
		return ys
	}
}

// countFillRows scans a flat element list for fill:N zones and returns the count
// of distinct row indices (max index + 1). Nested condition elements are not scanned.
func countFillRows(elems []widgets.Element) int {
	max := -1
	for _, e := range elems {
		if !strings.HasPrefix(e.Zone, "fill:") {
			continue
		}
		idx, err := strconv.Atoi(e.Zone[5:])
		if err == nil && idx > max {
			max = idx
		}
	}
	return max + 1
}

// zoneTextPos computes the absolute drawing position for an ElemText element
// that has a Zone set. When Zone is not set, returns the conventional e.X*w, e.Y*h.
func zoneTextPos(e widgets.Element, fillRowCount int, wx, wy, w, h float64) (tx, ty float64) {
	var yFrac float64
	switch e.Zone {
	case "header":
		yFrac = 0.1
	case "fill":
		yFrac = defaultFillYFrac
	case "footer":
		yFrac = 0.1
	case "":
		return wx + e.X*w, wy + e.Y*h
	default:
		if strings.HasPrefix(e.Zone, "fill:") {
			idx, err := strconv.Atoi(e.Zone[5:])
			if err == nil && fillRowCount > 0 && idx < fillRowCount {
				ys := fillZoneYs(fillRowCount)
				yFrac = ys[idx]
			} else {
				yFrac = defaultFillYFrac
			}
		} else {
			return wx + e.X*w, wy + e.Y*h
		}
	}
	ty = wy + yFrac*h
	if e.X > 0 {
		tx = wx + e.X*w
	} else {
		switch e.HAlign {
		case widgets.HAlignCenter:
			tx = wx + 0.5*w
		case widgets.HAlignEnd:
			tx = wx + 0.975*w
		default:
			tx = wx + 0.025*w
		}
	}
	return tx, ty
}

// renderText resolves the binding or uses the static Text, formats the value,
// and draws it at the fractional position within the widget bounding box.
// When elem.Zone is set, pixel X/Y are derived from zone + HAlign; otherwise
// elem.X and elem.Y fractions are used directly (backward compat).
func (p *Painter) renderText(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Element, fillRowCount int) {
	var display string
	if elem.Binding != "" {
		if val, ok := widgets.ResolveWithPrefs(frame, elem.Binding, prefs); ok {
			display = widgets.FormatValue(val, elem.Format, prefs)
		} else {
			display = elem.Text
		}
	} else {
		display = elem.Text
	}
	if display == "" {
		return
	}

	mul := rt.FontScale()
	size := elem.FontScale * mul * h
	if size <= 0 {
		return
	}

	fontName := fontFileName(rt.ResolveFont(elem.Font))
	p.face(dc, fontName, size)

	col := p.resolveColorExpr(frame, rt, prefs, elem.Color)
	dc.SetColor(col)
	tx, ty := zoneTextPos(elem, fillRowCount, x, y, w, h)
	ay := 0.5 // zone-based elements always use vertical centering
	if elem.Zone == "" {
		ay = valignFrac(elem.VAlign)
	}
	dc.DrawStringAnchored(display, tx, ty, halignFrac(elem.HAlign), ay)
}

// renderDot draws a filled circle at the fractional position within the widget.
func (p *Painter) renderDot(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Element) {
	col := p.resolveColorExpr(frame, rt, prefs, elem.Color)
	dc.SetColor(col)
	cx := x + elem.DotX*w
	cy := y + elem.DotY*h
	r := elem.DotR * h
	dc.DrawCircle(cx, cy, r)
	dc.Fill()
}

// renderHBar draws a horizontal fill bar (normal or centred-fraction).
func (p *Painter) renderHBar(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Element) {
	var pct float64
	if elem.BarBinding != "" {
		if val, ok := widgets.ResolveWithPrefs(frame, elem.BarBinding, prefs); ok {
			if f, ok := widgets.ToFloat64(val); ok {
				pct = f
			}
		}
	}
	bgRef := elem.BgColor
	if bgRef == "" {
		bgRef = "surface"
	}
	col := p.resolveColorExpr(frame, rt, prefs, elem.BarColor)
	bg := rt.Resolve(bgRef)
	bx := x + elem.BarX*w
	by := y + elem.BarY*h
	bw := elem.BarW * w
	bh := elem.BarH * h
	if elem.BarCentered {
		painterDrawHBarCentered(dc, bx, by, bw, bh, pct, col, bg)
	} else {
		painterDrawHBar(dc, bx, by, bw, bh, pct, col, bg)
	}
}

// renderDeltaBar draws a signed centred bar (lap delta).
func (p *Painter) renderDeltaBar(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Element) {
	var delta float64
	if elem.BarBinding != "" {
		if val, ok := widgets.ResolveWithPrefs(frame, elem.BarBinding, prefs); ok {
			if f, ok := widgets.ToFloat64(val); ok {
				delta = f
			}
		}
	}
	bgRef := elem.BgColor
	if bgRef == "" {
		bgRef = "surface"
	}
	bg := rt.Resolve(bgRef)
	bx := x + elem.BarX*w
	by := y + elem.BarY*h
	bw := elem.BarW * w
	bh := elem.BarH * h
	maxD := elem.MaxDelta
	if maxD <= 0 {
		maxD = 2.0
	}
	pct := math.Max(-1, math.Min(1, delta/maxD))
	mid := bx + bw/2
	fw := math.Abs(pct) * bw / 2

	dc.SetColor(bg)
	dc.DrawRoundedRectangle(bx, by, bw, bh, 3)
	dc.Fill()

	if delta > 0 {
		col := p.resolveColorExpr(frame, rt, prefs, elem.PosColor)
		dc.SetColor(col)
		dc.DrawRoundedRectangle(mid, by+1, fw, bh-2, 2)
		dc.Fill()
	} else if delta < 0 {
		col := p.resolveColorExpr(frame, rt, prefs, elem.NegColor)
		dc.SetColor(col)
		dc.DrawRoundedRectangle(mid-fw, by+1, fw, bh-2, 2)
		dc.Fill()
	}
}

// renderSegBar draws a vertical segmented bar (RPM indicator).
func (p *Painter) renderSegBar(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Element) {
	var pct float64
	if elem.SegBinding != "" {
		if val, ok := widgets.ResolveWithPrefs(frame, elem.SegBinding, prefs); ok {
			if f, ok := widgets.ToFloat64(val); ok {
				pct = f
			}
		}
	}
	segs := elem.Segments
	if segs <= 0 {
		segs = 20
	}
	segH := (h - 12) / float64(segs)
	filled := int(float64(segs) * clamp01(pct))
	for i := 0; i < segs; i++ {
		sy := y + 6 + (h - 12) - float64(i+1)*segH
		segPct := float64(i) / float64(segs)
		col := p.segStopColor(rt, elem.SegStops, segPct)
		if i >= filled {
			col = widgets.DimColor(col, 0.15)
		}
		dc.SetColor(col)
		dc.DrawRoundedRectangle(x+5, sy+1, w-10, segH-2, 2)
		dc.Fill()
	}
}

// segStopColor resolves the color for a segment bar at the given pct position.
func (p *Painter) segStopColor(rt widgets.RenderTheme, stops []widgets.SegColorStop, pct float64) color.RGBA {
	col := rt.Resolve("accent")
	for _, stop := range stops {
		if pct >= stop.At {
			col = rt.Resolve(stop.Color)
		}
	}
	return col
}

// renderGrid draws an NxM grid of labelled data cells within the given bounds.
func (p *Painter) renderGrid(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Element) {
	rows := elem.GridRows
	cols := elem.GridCols
	if rows <= 0 || cols <= 0 {
		return
	}
	gap := elem.GridGap * h
	cellW := (w - gap*float64(cols-1)) / float64(cols)
	cellH := (h - gap*float64(rows-1)) / float64(rows)

	if elem.GridLines {
		dc.SetColor(rt.Resolve("muted"))
		dc.SetLineWidth(1)
		for c := 1; c < cols; c++ {
			lx := x + float64(c)*(cellW+gap) - gap/2
			dc.DrawLine(lx, y, lx, y+h)
			dc.Stroke()
		}
		for r := 1; r < rows; r++ {
			ly := y + float64(r)*(cellH+gap) - gap/2
			dc.DrawLine(x, ly, x+w, ly)
			dc.Stroke()
		}
	}

	for i, cell := range elem.GridCells {
		col := i % cols
		row := i / cols
		if row >= rows {
			break
		}
		cx := x + float64(col)*(cellW+gap)
		cy := y + float64(row)*(cellH+gap)

		if cell.Label != "" {
			p.face(dc, "SpaceGrotesk-Regular.ttf", cellH*0.28)
			dc.SetColor(p.resolveColorExpr(frame, rt, prefs, cell.LabelColor))
			dc.DrawString(cell.Label, cx+4, cy+cellH*0.4)
		}

		if cell.Binding != "" {
			val, ok := widgets.ResolveWithPrefs(frame, cell.Binding, prefs)
			if ok {
				p.face(dc, "JetBrainsMono-Bold.ttf", cellH*0.48)
				if cell.ColorFn != "" {
					dc.SetColor(p.resolveColorFn(cell.ColorFn, val))
				} else {
					dc.SetColor(p.resolveColorExpr(frame, rt, prefs, cell.Color))
				}
				text := widgets.FormatValue(val, cell.Format, prefs)
				dc.DrawStringAnchored(text, cx+cellW-4, cy+cellH*0.45, 1, 0)
			}
		}
	}
}

// resolveColorFn resolves a named color function from a value.
func (p *Painter) resolveColorFn(name string, val any) color.RGBA {
	switch name {
	case "tyre_temp":
		if f, ok := widgets.ToFloat64(val); ok {
			return widgets.TyreColor(f)
		}
	}
	return widgets.ColorForeground
}

// renderCondition evaluates the condition binding and renders Then or Else elements.
func (p *Painter) renderCondition(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Element) {
	cond := false
	if val, ok := widgets.ResolveWithPrefs(frame, elem.CondBinding, prefs); ok {
		cond = isTruthy(val, elem.CondAbove)
	}
	if cond {
		p.renderElements(dc, frame, rt, prefs, x, y, w, h, elem.Then)
	} else {
		p.renderElements(dc, frame, rt, prefs, x, y, w, h, elem.Else)
	}
}

// resolveColorExpr resolves a ColorExpr to a concrete color against the frame and render theme.
func (p *Painter) resolveColorExpr(frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, expr widgets.ColorExpr) color.RGBA {
	for _, when := range expr.When {
		if val, ok := widgets.ResolveWithPrefs(frame, when.Binding, prefs); ok {
			match := false
			if when.Equals != nil {
				if f, ok := widgets.ToFloat64(val); ok {
					match = f == *when.Equals
				}
			} else {
				match = isTruthy(val, when.Above)
			}
			if match {
				return rt.Resolve(when.Ref)
			}
		}
	}
	if expr.DynamicRef != "" {
		if val, ok := widgets.ResolveWithPrefs(frame, expr.DynamicRef, prefs); ok {
			if s, ok := val.(string); ok {
				return rt.Resolve(widgets.ColorRef(s))
			}
		}
	}
	return rt.Resolve(expr.Ref)
}

// isTruthy returns true when val is considered "truthy" (> above, or non-zero/non-false).
func isTruthy(val any, above float64) bool {
	switch v := val.(type) {
	case bool:
		return v
	case float64:
		return v > above
	case float32:
		return float64(v) > above
	case int:
		return float64(v) > above
	case int8:
		return float64(v) > above
	case int16:
		return float64(v) > above
	case int32:
		return float64(v) > above
	case int64:
		return float64(v) > above
	case uint:
		return float64(v) > above
	case uint8:
		return float64(v) > above
	case uint16:
		return float64(v) > above
	case uint32:
		return float64(v) > above
	case uint64:
		return float64(v) > above
	case string:
		return v != ""
	}
	return false
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
