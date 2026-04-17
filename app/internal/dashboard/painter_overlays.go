package dashboard

import (
	"image/color"
	"time"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/app/internal/dashboard/alerts"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
)

const defaultAlertDuration = 1500 * time.Millisecond

// alertState holds the currently active full-screen alert overlay.
type alertState struct {
	text      string
	color     color.RGBA
	expiresAt time.Time
}

// checkAlerts iterates over the layout's configured alert instances, calling
// each registered alert type's Check method. The last event that fires wins.
// prevFrame is updated after each call so future comparisons stay accurate.
func (p *Painter) checkAlerts(frame *dto.TelemetryFrame, layout *DashLayout) {
	now := time.Now()
	theme := layout.Theme
	if theme == (widgets.DashTheme{}) {
		theme = widgets.DefaultTheme()
	}
	domain := layout.DomainPalette

	for _, inst := range layout.Alerts {
		a, ok := alerts.GetAlert(inst.Type)
		if !ok {
			continue
		}
		// Skip if this alert type is capability-gated and the car doesn't support it.
		if cb := a.Meta().CapabilityBinding; cb != "" {
			if val, ok := widgets.Resolve(frame, cb); ok {
				if available, _ := val.(bool); !available {
					continue
				}
			}
		}
		event := a.Check(frame, p.prevFrame, inst.Config)
		if event == nil {
			continue
		}
		rt := widgets.RenderTheme{Theme: theme, Domain: domain}
		c := rt.Resolve(widgets.ColorRef(event.Color))
		dur := alerts.ConfigFloat(inst.Config, "duration", 0)
		if dur <= 0 {
			dur = defaultAlertDuration.Seconds()
		}
		p.alert = alertState{
			text:      event.Text,
			color:     c,
			expiresAt: now.Add(time.Duration(dur * float64(time.Second))),
		}
	}
	p.prevFrame = frame
}

// applyAlertOverlay paints a full-screen overlay when an alert is active.
// It renders a semi-transparent dark backdrop, coloured accent bars at the
// top and bottom edges, and large centred text showing the changed parameter.
func (p *Painter) applyAlertOverlay(dc *gg.Context, w, h float64) {
	if p.alert.expiresAt.IsZero() || time.Now().After(p.alert.expiresAt) {
		return
	}

	dc.SetRGBA(0, 0, 0, 1)
	dc.DrawRectangle(0, 0, w, h)
	dc.Fill()

	c := p.alert.color
	dc.SetColor(c)
	dc.DrawRectangle(0, 0, w, 10)
	dc.Fill()
	dc.DrawRectangle(0, h-10, w, 10)
	dc.Fill()

	fontHeight := h * 0.28
	p.face(dc, "JetBrainsMono-Bold.ttf", h*0.28)
	dc.SetColor(color.RGBA{R: c.R, G: c.G, B: c.B, A: 255})
	dc.DrawStringAnchored(p.alert.text, w/2, h/2-fontHeight/2, 0.5, 0.5)
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
	p.face(dc, "SpaceGrotesk-Bold.ttf", 14)
	dc.SetColor(widgets.ColorBackground)
	dc.DrawStringAnchored(flagText, w/2, h-15, 0.5, 0.5)
}
