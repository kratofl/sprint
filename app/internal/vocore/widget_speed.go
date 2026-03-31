package vocore

import "github.com/kratofl/sprint/app/internal/dash"

func init() { registerWidget(dash.WidgetSpeed, drawWidgetSpeed) }

func drawWidgetSpeed(c WidgetCtx) {
	c.Panel()
	c.FontNumber(c.H * 0.45)
	c.DC.SetColor(colTextPri)
	c.DC.DrawStringAnchored(c.FmtSpeed(float64(c.Frame.Car.SpeedMS)), c.CX(), c.Y+c.H*0.4, 0.5, 0.5)
	c.FontLabel(c.H * 0.18)
	c.DC.SetColor(colTextMuted)
	c.DC.DrawStringAnchored("km/h", c.CX(), c.Y+c.H*0.72, 0.5, 0.5)
}
