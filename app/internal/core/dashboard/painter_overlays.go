package dashboard

import (
	"image/color"
	"time"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/app/internal/core/dashboard/alerts"
	"github.com/kratofl/sprint/app/internal/core/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
)

const defaultAlertDuration = 1500 * time.Millisecond

// alertState holds the currently active alert overlay and the shared display
// controls captured when it fired.
type alertState struct {
	text        string
	color       color.RGBA
	displayMode alerts.AlertDisplayMode
	colorMode   alerts.AlertColorMode
	expiresAt   time.Time
}

// effectiveAlertConfig resolves the dashboard's shared alert config, migrating a
// legacy per-instance alert list on the fly when AlertConfig has no enabled types.
func effectiveAlertConfig(layout *DashLayout) alerts.AlertConfig {
	cfg := layout.AlertConfig
	if len(cfg.EnabledTypes) == 0 && len(layout.Alerts) > 0 {
		return alerts.MigrateAlertConfig(layout.Alerts, cfg)
	}
	return cfg.WithDefaults()
}

// checkAlerts evaluates the dashboard's enabled alert types in a stable priority
// order (so simultaneous triggers resolve deterministically) and arms the shared
// overlay for the configured duration. The last firing alert in priority order wins.
func (p *Painter) checkAlerts(frame *dto.TelemetryFrame, layout *DashLayout) {
	now := time.Now()
	// Alert colours come from the same resolved accent/domain theme as the widgets
	// (PRD #40), including theme presets, global defaults, and per-layout overrides.
	theme := p.resolvedTheme(layout)
	domain := p.resolvedDomainPalette(layout)
	cfg := effectiveAlertConfig(layout)

	for _, t := range cfg.EnabledTypesSorted() {
		a, ok := alerts.GetAlert(t)
		if !ok {
			continue
		}
		// Skip if this alert type is capability-gated and the car doesn't support it.
		if cb := a.Meta().CapabilityBinding; cb != "" {
			if val, ok := widgets.Resolve(frame, widgets.Binding(cb)); ok {
				if available, _ := val.(bool); !available {
					continue
				}
			}
		}
		event := a.Check(frame, p.prevFrame, nil)
		if event == nil {
			continue
		}
		rt := widgets.RenderTheme{Theme: theme, Domain: domain}
		c := rt.Resolve(widgets.ColorRef(event.Color))
		dur := cfg.Duration
		if dur <= 0 {
			dur = defaultAlertDuration.Seconds()
		}
		p.alert = alertState{
			text:        event.Text,
			color:       color.RGBA{R: c.R, G: c.G, B: c.B, A: 255},
			displayMode: cfg.DisplayMode,
			colorMode:   cfg.ColorMode,
			expiresAt:   now.Add(time.Duration(dur * float64(time.Second))),
		}
	}
	p.prevFrame = frame
}

// applyAlertOverlay paints the active alert. The shared color mode chooses the
// fill (semantic colour in normal mode, pure black in inverted mode) and a legible
// foreground; the display mode chooses full-screen coverage or a centred wide
// rounded instrument that leaves the rest of the dashboard visible.
func (p *Painter) applyAlertOverlay(dc *gg.Context, w, h float64) {
	if p.alert.expiresAt.IsZero() || time.Now().After(p.alert.expiresAt) {
		return
	}

	semantic := color.RGBA{R: p.alert.color.R, G: p.alert.color.G, B: p.alert.color.B, A: 255}
	var fill, fg color.RGBA
	if p.alert.colorMode == alerts.AlertColorInverted {
		fill = widgets.FixedCanvasBackground
		fg = semantic
	} else {
		fill = semantic
		fg = widgets.ContrastForeground(fill)
	}

	if p.alert.displayMode == alerts.AlertDisplayMiddle {
		iw, ih := w*0.7, h*0.4
		ix, iy := (w-iw)/2, (h-ih)/2
		r := ih * 0.32
		dc.SetColor(fill)
		dc.DrawRoundedRectangle(ix, iy, iw, ih, r)
		dc.Fill()
		// In inverted mode the black instrument needs a semantic outline to read
		// against the black dashboard around it.
		if p.alert.colorMode == alerts.AlertColorInverted {
			dc.SetColor(fg)
			dc.SetLineWidth(3)
			dc.DrawRoundedRectangle(ix, iy, iw, ih, r)
			dc.Stroke()
		}
		p.faceAny(dc, fontFileNames(widgets.FontFamilyMono, true), ih*0.5)
		dc.SetColor(fg)
		dc.DrawStringAnchored(p.alert.text, w/2, h/2, 0.5, 0.5)
		return
	}

	// Full-screen.
	dc.SetColor(fill)
	dc.DrawRectangle(0, 0, w, h)
	dc.Fill()
	p.faceAny(dc, fontFileNames(widgets.FontFamilyMono, true), h*0.28)
	dc.SetColor(fg)
	dc.DrawStringAnchored(p.alert.text, w/2, h/2, 0.5, 0.5)
}

// applyFlagOverlay draws the flag status banner over the rendered frame when a flag is active.
func (p *Painter) applyFlagOverlay(dc *gg.Context, frame *dto.TelemetryFrame, w, h float64) {
	if frame == nil || (!frame.Flags.Yellow && !frame.Flags.Red && !frame.Flags.SafetyCar) {
		return
	}
	var flagCol color.RGBA
	var flagText string
	switch {
	case frame.Flags.Red:
		flagCol, flagText = widgets.ColorDanger, "RED FLAG"
	case frame.Flags.SafetyCar:
		flagCol, flagText = widgets.ColorWarning, "SAFETY CAR"
	default:
		flagCol, flagText = widgets.ColorWarning, "YELLOW FLAG"
	}
	dc.SetRGBA255(int(flagCol.R), int(flagCol.G), int(flagCol.B), 25)
	dc.DrawRectangle(0, 0, w, h)
	dc.Fill()
	dc.SetColor(flagCol)
	dc.DrawRectangle(0, h-30, w, 30)
	dc.Fill()
	p.faceAny(dc, fontFileNames(widgets.FontFamilyUI, true), 14)
	dc.SetColor(widgets.ColorBackground)
	dc.DrawStringAnchored(flagText, w/2, h-15, 0.5, 0.5)
}
