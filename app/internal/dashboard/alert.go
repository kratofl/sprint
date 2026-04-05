package dashboard

import (
	"fmt"
	"image/color"
	"time"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
)

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
