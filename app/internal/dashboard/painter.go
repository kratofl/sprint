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
	bgCol color.RGBA

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
	// globalTypography holds the global-level dash typography defaults.
	globalTypography atomic.Pointer[widgets.TypographySettings]
	// profile holds app-level display strings such as driver name/number.
	profile atomic.Pointer[RenderProfile]

	wrapperMu     sync.RWMutex
	wrapperStates map[string]string

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
		p.resetWrapperStates(layout)
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
	if layout := p.layout.Load(); layout != nil && index < len(layout.Pages) {
		p.resetPageWrapperStates(layout.Pages[index])
	}
	p.widgetCaches = nil
}

// SetIdle controls whether the idle page is rendered.
// When true, the idle page is shown regardless of active page index.
func (p *Painter) SetIdle(idle bool) {
	p.idle.Store(idle)
	if idle {
		if layout := p.layout.Load(); layout != nil {
			p.resetPageWrapperStates(layout.IdlePage)
		}
	}
	p.widgetCaches = nil
}

// SetGlobalPrefs stores the global-level FormatPreferences applied as the base
// layer under per-layout overrides. Call whenever the user saves global dash
// settings so all active painters reflect the change immediately.
func (p *Painter) SetGlobalPrefs(prefs widgets.FormatPreferences) {
	p.globalPrefs.Store(&prefs)
	p.widgetCaches = nil
}

// SetGlobalTypography stores the global dash-level typography defaults.
func (p *Painter) SetGlobalTypography(typography widgets.TypographySettings) {
	p.globalTypography.Store(&typography)
	p.widgetCaches = nil
}

// SetProfile stores app-level display strings used by profile.* text bindings.
func (p *Painter) SetProfile(profile RenderProfile) {
	p.profile.Store(&profile)
	p.widgetCaches = nil
}

// SetWrapperVariant selects the active wrapper variant for a specific page/group.
func (p *Painter) SetWrapperVariant(pageID, groupID, variantID string) {
	p.wrapperMu.Lock()
	defer p.wrapperMu.Unlock()
	if p.wrapperStates == nil {
		p.wrapperStates = map[string]string{}
	}
	p.wrapperStates[wrapperStateKey(pageID, groupID)] = variantID
	p.widgetCaches = nil
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
	if layout := p.layout.Load(); layout != nil {
		page := p.currentPage(layout)
		p.ensureBg(p.pageBackground(layout, page))
		dc := p.getContext()
		p.checkAlerts(frame, layout)
		for _, widget := range page.Widgets {
			p.dispatchWidget(dc, frame, widget, layout)
		}
		p.dispatchWrapperGroups(dc, frame, page, layout)
		p.applyAlertOverlay(dc, float64(p.width), float64(p.height))
		p.applyFlagOverlay(dc, frame, float64(p.width), float64(p.height))
		return dc.Image(), nil
	}

	p.ensureBg(widgets.ColorBackground)
	dc := p.getContext()
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
		Theme:            theme,
		Domain:           layout.DomainPalette,
		Style:            w.Style,
		Typography:       layout.Typography,
		GlobalTypography: p.currentGlobalTypography(),
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
		panel := widgets.Panel{CornerR: meta.Panel.CornerR, NoBorder: meta.Panel.NoBorder}
		elems = append([]widgets.Element{panel}, elems...)
	}

	// Capability gate: if the widget declares a CapabilityBinding and the frame
	// resolves it to false, render a static "not available" placeholder instead.
	if meta.CapabilityBinding != "" {
		if val, ok := widgets.Resolve(frame, meta.CapabilityBinding); ok {
			if available, _ := val.(bool); !available {
				cache.ctx.SetColor(widgets.ColorBackground)
				cache.ctx.Clear()
				p.renderPanel(cache.ctx, rt, 0, 0, pw, ph, widgets.Panel{})
				naHdrStyle := widgets.TextStyle{
					Font:     widgets.FontFamilyUI,
					FontSize: 0.18,
					HAlign:   meta.Label.Align,
					Color:    widgets.ColorRefMuted.Expr(),
				}
				p.renderText(cache.ctx, frame, rt, prefs, 0, 0, pw, ph,
					widgets.Text{Text: strings.ToUpper(meta.Name), Style: naHdrStyle}, 0.1)
				naValStyle := widgets.TextStyle{
					Font:     widgets.FontFamilyMono,
					FontSize: 0.45,
					IsBold:   true,
					HAlign:   widgets.HAlignCenter,
					Color:    widgets.ColorRefMuted.Expr(),
				}
				p.renderText(cache.ctx, frame, rt, prefs, 0, 0, pw, ph,
					widgets.Text{Text: "—", Style: naValStyle}, 0.5)
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
			for i, e := range elems {
				if p, ok := e.(widgets.Panel); ok {
					p.FillColor = col
					p.FillAlpha = alpha
					elems[i] = p
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

	// Render the auto label after the widget body so it survives the clear above
	// and matches the final pixels shown on the physical screen.
	if !meta.Label.Hidden {
		text := meta.Label.Text
		if text == "" {
			text = strings.ToUpper(meta.Name)
		}
		fontScale := meta.Label.FontScale
		if fontScale == 0 {
			fontScale = 0.12
		}
		hdrStyle := widgets.TextStyle{
			Font:     widgets.FontFamilyUI,
			FontSize: fontScale,
			HAlign:   meta.Label.Align,
			Color:    widgets.ColorRefMuted.Expr(),
		}
		p.renderText(cache.ctx, frame, rt, prefs, 0, 0, pw, ph,
			widgets.Text{Text: text, Style: hdrStyle}, 0.1)
	}
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
// Text elements are distributed vertically (auto-stacked) based on their count.
// All other elements are rendered in order by renderElement.
func (p *Painter) renderElements(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elems []widgets.Element) {
	textCount := 0
	for _, e := range elems {
		if _, ok := e.(widgets.Text); ok {
			textCount++
		}
	}
	ys := textAutoStackYs(textCount)
	textIdx := 0
	for _, e := range elems {
		if t, ok := e.(widgets.Text); ok {
			p.renderText(dc, frame, rt, prefs, x, y, w, h, t, ys[textIdx])
			textIdx++
		} else {
			p.renderElement(dc, frame, rt, prefs, x, y, w, h, e)
		}
	}
}

// renderElement renders a single non-Text element within the widget bounding box.
func (p *Painter) renderElement(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Element) {
	switch e := elem.(type) {
	case widgets.Panel:
		p.renderPanel(dc, rt, x, y, w, h, e)
	case widgets.Dot:
		p.renderDot(dc, frame, rt, prefs, x, y, w, h, e)
	case widgets.Bar:
		p.renderHBar(dc, frame, rt, prefs, x, y, w, h, e)
	case widgets.DeltaBar:
		p.renderDeltaBar(dc, frame, rt, prefs, x, y, w, h, e)
	case widgets.SegBar:
		p.renderSegBar(dc, frame, rt, prefs, x, y, w, h, e)
	case widgets.Grid:
		p.renderGrid(dc, frame, rt, prefs, x, y, w, h, e)
	case widgets.Condition:
		p.renderCondition(dc, frame, rt, prefs, x, y, w, h, e)
	}
}

// renderPanel draws the widget background (border + fill) plus an optional FillColor overlay.
func (p *Painter) renderPanel(dc *gg.Context, rt widgets.RenderTheme, x, y, w, h float64, elem widgets.Panel) {
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

// textAutoStackYs returns the vertical center fractions for n auto-stacked Text
// elements. Returns nil for n == 0.
func textAutoStackYs(n int) []float64 {
	switch n {
	case 0:
		return nil
	case 1:
		return []float64{0.5}
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

// renderText draws a text element at the given yFrac (vertical center fraction
// of the widget bounding box). yFrac is assigned by renderElements via textAutoStackYs.
func (p *Painter) renderText(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Text, yFrac float64) {
	var display string
	if elem.Binding != "" {
		if val, ok := p.resolveTextBinding(frame, elem.Binding, prefs); ok {
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

	style := elem.Style
	size := style.FontSize * rt.FontScale() * h
	if size <= 0 {
		return
	}

	family, bold := resolveTextStyle(style, rt)
	p.face(dc, fontFileName(family, bold), size)
	dc.SetColor(p.resolveColorExpr(frame, rt, prefs, style.Color))

	var tx float64
	switch style.HAlign {
	case widgets.HAlignCenter:
		tx = x + 0.5*w
	case widgets.HAlignEnd:
		tx = x + 0.975*w
	default:
		tx = x + 0.025*w
	}
	ty := y + yFrac*h
	ay := 0.5
	if style.VAlign != 0 {
		ay = valignFrac(style.VAlign)
	}
	dc.DrawStringAnchored(display, tx, ty, halignFrac(style.HAlign), ay)
}

// renderDot draws a filled circle at the fractional position within the widget.
func (p *Painter) renderDot(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Dot) {
	col := p.resolveColorExpr(frame, rt, prefs, elem.Color)
	dc.SetColor(col)
	cx := x + elem.X*w
	cy := y + elem.Y*h
	r := elem.R * h
	dc.DrawCircle(cx, cy, r)
	dc.Fill()
}

// renderHBar draws a horizontal fill bar (normal or centred-fraction).
func (p *Painter) renderHBar(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Bar) {
	var pct float64
	if elem.Binding != "" {
		if val, ok := widgets.ResolveWithPrefs(frame, elem.Binding, prefs); ok {
			if f, ok := widgets.ToFloat64(val); ok {
				pct = f
			}
		}
	}
	bgRef := elem.BgColor
	if bgRef == "" {
		bgRef = "surface"
	}
	col := p.resolveColorExpr(frame, rt, prefs, elem.Color)
	bg := rt.Resolve(bgRef)
	bx := x + elem.X*w
	by := y + elem.Y*h
	bw := elem.W * w
	bh := elem.H * h
	if elem.Centered {
		painterDrawHBarCentered(dc, bx, by, bw, bh, pct, col, bg)
	} else {
		painterDrawHBar(dc, bx, by, bw, bh, pct, col, bg)
	}
}

// renderDeltaBar draws a signed centred bar (lap delta).
func (p *Painter) renderDeltaBar(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.DeltaBar) {
	var delta float64
	if elem.Binding != "" {
		if val, ok := widgets.ResolveWithPrefs(frame, elem.Binding, prefs); ok {
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
	bx := x + elem.X*w
	by := y + elem.Y*h
	bw := elem.W * w
	bh := elem.H * h
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
func (p *Painter) renderSegBar(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.SegBar) {
	var pct float64
	if elem.Binding != "" {
		if val, ok := widgets.ResolveWithPrefs(frame, elem.Binding, prefs); ok {
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
		col := p.segStopColor(rt, elem.Stops, segPct)
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

// renderGrid draws an NxM grid of cells within the given bounds.
// Columns use ColWidths fractional widths when provided; otherwise equal width.
// Cells render using Style when set; otherwise fall back to legacy label+binding layout.
func (p *Painter) renderGrid(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Grid) {
	rows := elem.Rows
	cols := elem.Cols
	if rows <= 0 || cols <= 0 {
		return
	}
	gap := elem.Gap * h
	cellH := (h - gap*float64(rows-1)) / float64(rows)

	// Compute per-column widths.
	colWs := make([]float64, cols)
	if len(elem.ColWidths) == cols {
		available := w - gap*float64(cols-1)
		for c, frac := range elem.ColWidths {
			colWs[c] = frac * available
		}
	} else {
		cw := (w - gap*float64(cols-1)) / float64(cols)
		for c := range colWs {
			colWs[c] = cw
		}
	}

	// Compute column X start positions.
	colXs := make([]float64, cols)
	colXs[0] = x
	for c := 1; c < cols; c++ {
		colXs[c] = colXs[c-1] + colWs[c-1] + gap
	}

	if elem.Lines {
		dc.SetColor(rt.Resolve("muted"))
		dc.SetLineWidth(1)
		for c := 1; c < cols; c++ {
			lx := colXs[c] - gap/2
			dc.DrawLine(lx, y, lx, y+h)
			dc.Stroke()
		}
		for r := 1; r < rows; r++ {
			ly := y + float64(r)*(cellH+gap) - gap/2
			dc.DrawLine(x, ly, x+w, ly)
			dc.Stroke()
		}
	}

	for i, cell := range elem.Cells {
		c := i % cols
		row := i / cols
		if row >= rows {
			break
		}
		cx := colXs[c]
		cy := y + float64(row)*(cellH+gap)
		cw := colWs[c]

		if cell.Label != "" && cell.Binding != "" {
			// Legacy label+value layout (e.g. TyreTemp): label small top-left, value large right.
			p.face(dc, "SpaceGrotesk-Regular.ttf", cellH*0.28)
			dc.SetColor(p.resolveColorExpr(frame, rt, prefs, cell.LabelColor))
			dc.DrawString(cell.Label, cx+4, cy+cellH*0.4)
			if val, ok := widgets.ResolveWithPrefs(frame, cell.Binding, prefs); ok {
				p.face(dc, "JetBrainsMono-Bold.ttf", cellH*0.48)
				var col color.RGBA
				if cell.ColorFn != "" {
					col = p.resolveColorFn(cell.ColorFn, val)
				} else {
					col = p.resolveColorExpr(frame, rt, prefs, cell.Color)
				}
				dc.SetColor(col)
				text := widgets.FormatValue(val, cell.Format, prefs)
				dc.DrawStringAnchored(text, cx+cw-4, cy+cellH*0.45, 1, 0)
			}
			continue
		}

		// Style-based single-content cell.
		var display string
		if cell.Binding != "" {
			if val, ok := widgets.ResolveWithPrefs(frame, cell.Binding, prefs); ok {
				display = widgets.FormatValue(val, cell.Format, prefs)
			} else {
				display = cell.Text
			}
		} else {
			display = cell.Text
		}
		if display == "" {
			continue
		}

		style := cell.Style
		size := style.FontSize * rt.FontScale() * cellH
		if size <= 0 {
			continue
		}
		family, bold := resolveTextStyle(style, rt)
		p.face(dc, fontFileName(family, bold), size)

		colorExpr := style.Color
		if colorExpr.Ref == "" && colorExpr.DynamicRef == "" && len(colorExpr.When) == 0 {
			colorExpr = cell.Color
		}
		dc.SetColor(p.resolveColorExpr(frame, rt, prefs, colorExpr))

		var tx float64
		switch style.HAlign {
		case widgets.HAlignCenter:
			tx = cx + cw*0.5
		case widgets.HAlignEnd:
			tx = cx + cw - 4
		default:
			tx = cx + 4
		}
		dc.DrawStringAnchored(display, tx, cy+cellH*0.5, halignFrac(style.HAlign), 0.5)
	}
}

func resolveTextStyle(style widgets.TextStyle, rt widgets.RenderTheme) (widgets.FontFamily, bool) {
	switch rt.ResolveFont(baseFontStyle(style)) {
	case widgets.FontNumber:
		return widgets.FontFamilyMono, true
	case widgets.FontMono:
		return widgets.FontFamilyMono, false
	case widgets.FontBold:
		return widgets.FontFamilyUI, true
	default:
		return widgets.FontFamilyUI, false
	}
}

func baseFontStyle(style widgets.TextStyle) widgets.FontStyle {
	if style.Font == widgets.FontFamilyMono || style.TabulaNums {
		if style.IsBold {
			return widgets.FontNumber
		}
		return widgets.FontMono
	}
	if style.IsBold {
		return widgets.FontBold
	}
	return widgets.FontLabel
}

func (p *Painter) currentPage(layout *DashLayout) DashPage {
	if p.idle.Load() {
		return layout.IdlePage
	}
	idx := int(p.activePageIndex.Load())
	if idx >= len(layout.Pages) {
		idx = 0
	}
	if len(layout.Pages) == 0 {
		return layout.IdlePage
	}
	return layout.Pages[idx]
}

func (p *Painter) pageBackground(layout *DashLayout, page DashPage) color.RGBA {
	if page.Background != nil {
		return *page.Background
	}
	theme := layout.Theme
	if theme == (widgets.DashTheme{}) {
		theme = widgets.DefaultTheme()
	}
	return theme.Bg
}

func (p *Painter) currentGlobalTypography() widgets.TypographySettings {
	if typography := p.globalTypography.Load(); typography != nil {
		return *typography
	}
	return widgets.TypographySettings{}
}

func (p *Painter) dispatchWrapperGroups(dc *gg.Context, frame *dto.TelemetryFrame, page DashPage, layout *DashLayout) {
	for _, group := range page.WrapperGroups {
		variant := p.activeWrapperVariant(page.ID, group)
		if variant == nil {
			continue
		}
		for _, child := range variant.Widgets {
			abs := child
			abs.ID = wrapperCacheID(group.ID, variant.ID, child.ID)
			abs.Col += group.Col
			abs.Row += group.Row
			p.dispatchWidget(dc, frame, abs, layout)
		}
	}
}

func (p *Painter) resolveTextBinding(frame *dto.TelemetryFrame, binding widgets.Binding, prefs widgets.FormatPreferences) (any, bool) {
	switch binding {
	case "profile.driverName":
		if profile := p.profile.Load(); profile != nil && profile.DriverName != "" {
			return profile.DriverName, true
		}
	case "profile.driverNumber":
		if profile := p.profile.Load(); profile != nil && profile.DriverNumber != "" {
			return profile.DriverNumber, true
		}
	}
	return widgets.ResolveWithPrefs(frame, binding, prefs)
}

func (p *Painter) resetWrapperStates(layout *DashLayout) {
	states := map[string]string{}
	addPageWrapperDefaults(states, layout.IdlePage)
	for _, page := range layout.Pages {
		addPageWrapperDefaults(states, page)
	}
	p.wrapperMu.Lock()
	p.wrapperStates = states
	p.wrapperMu.Unlock()
}

func (p *Painter) resetPageWrapperStates(page DashPage) {
	p.wrapperMu.Lock()
	defer p.wrapperMu.Unlock()
	if p.wrapperStates == nil {
		p.wrapperStates = map[string]string{}
	}
	for _, group := range page.WrapperGroups {
		p.wrapperStates[wrapperStateKey(page.ID, group.ID)] = defaultVariantID(group)
	}
}

func (p *Painter) activeWrapperVariant(pageID string, group DashWrapperGroup) *DashWrapperVariant {
	activeID := defaultVariantID(group)
	p.wrapperMu.RLock()
	if p.wrapperStates != nil {
		if selected := p.wrapperStates[wrapperStateKey(pageID, group.ID)]; selected != "" {
			activeID = selected
		}
	}
	p.wrapperMu.RUnlock()
	for i := range group.Variants {
		if group.Variants[i].ID == activeID {
			return &group.Variants[i]
		}
	}
	if len(group.Variants) == 0 {
		return nil
	}
	return &group.Variants[0]
}

func addPageWrapperDefaults(states map[string]string, page DashPage) {
	for _, group := range page.WrapperGroups {
		states[wrapperStateKey(page.ID, group.ID)] = defaultVariantID(group)
	}
}

func defaultVariantID(group DashWrapperGroup) string {
	if group.DefaultVariantID != "" {
		return group.DefaultVariantID
	}
	if len(group.Variants) > 0 {
		return group.Variants[0].ID
	}
	return ""
}

func wrapperStateKey(pageID, groupID string) string {
	return pageID + "::" + groupID
}

func wrapperCacheID(groupID, variantID, widgetID string) string {
	return groupID + "::" + variantID + "::" + widgetID
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
func (p *Painter) renderCondition(dc *gg.Context, frame *dto.TelemetryFrame, rt widgets.RenderTheme, prefs widgets.FormatPreferences, x, y, w, h float64, elem widgets.Condition) {
	cond := false
	if val, ok := widgets.ResolveWithPrefs(frame, elem.Binding, prefs); ok {
		cond = isTruthy(val, elem.Above)
	}
	if cond {
		p.renderElements(dc, frame, rt, prefs, x, y, w, h, []widgets.Element(elem.Then))
	} else {
		p.renderElements(dc, frame, rt, prefs, x, y, w, h, []widgets.Element(elem.Else))
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
