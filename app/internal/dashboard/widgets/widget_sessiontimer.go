package widgets

import "fmt"

const WidgetSessionTimer WidgetType = "session_timer"

func init() {
	RegisterWidget(WidgetSessionTimer, "Session Timer", CategoryTiming, 4, 2, false, 5, nil, drawWidgetSessionTimer)
}

func fmtSessionTime(secs float64) string {
	t := int(secs)
	if t < 0 {
		t = 0
	}
	h := t / 3600
	m := (t % 3600) / 60
	s := t % 60
	if h > 0 {
		return fmt.Sprintf("%d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%02d:%02d", m, s)
}

func drawWidgetSessionTimer(c WidgetCtx) {
	c.Panel()
	c.FontLabel(c.H * 0.18)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("SESSION", c.CX(), c.Y+c.H*0.22, 0.5, 0.5)

	c.FontNumber(c.H * 0.45)
	c.DC.SetColor(ColTextPri)
	c.DC.DrawStringAnchored(fmtSessionTime(c.Frame.Session.SessionTime), c.CX(), c.CY()+c.H*0.1, 0.5, 0.5)
}
