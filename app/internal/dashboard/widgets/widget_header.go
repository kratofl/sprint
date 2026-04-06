package widgets

import (
	"fmt"
)

const WidgetHeader WidgetType = "header"

func init() {
	RegisterWidget(WidgetHeader, "Header", CategoryLayout, 20, 2, true, 5, nil, drawWidgetHeader)
}

// drawWidgetHeader renders the session info bar across the top of the screen:
// app name, track, car, session type, lap counter, and live indicator.
func drawWidgetHeader(c WidgetCtx) {
	c.Panel()

	c.FontLabel(c.H * 0.35)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("SPRINT", c.X+16, c.CY(), 0, 0.5)

	c.DC.SetColor(ColTextPri)
	c.DC.DrawStringAnchored(c.Frame.Session.Track, c.X+100, c.CY(), 0, 0.5)
	c.DC.SetColor(ColTextSec)
	c.DC.DrawStringAnchored(c.Frame.Session.Car, c.X+282, c.CY(), 0, 0.5)
	c.DC.DrawStringAnchored(string(c.Frame.Session.SessionType), c.X+492, c.CY(), 0, 0.5)

	c.FontMono(c.H * 0.30)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored(fmt.Sprintf("L%d", c.Frame.Lap.CurrentLap), c.X+c.W-72, c.CY(), 0, 0.5)

	c.DC.SetColor(ColTeal)
	c.DC.DrawCircle(c.X+c.W-22, c.CY(), 4)
	c.DC.Fill()
	c.FontLabel(c.H * 0.25)
	c.DC.DrawStringAnchored("LIVE", c.X+c.W-10, c.CY(), 1, 0.5)
}
