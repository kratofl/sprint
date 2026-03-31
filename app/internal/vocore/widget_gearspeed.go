package vocore

import (
	"fmt"

	"github.com/kratofl/sprint/app/internal/dash"
)

func init() { registerWidget(dash.WidgetGearSpeed, drawWidgetGearSpeed) }

// drawWidgetGearSpeed renders the combined gear + speed panel used by the
// default layout: a large gear number in the upper portion of the panel and
// the current speed with a "km/h" unit label below it.
func drawWidgetGearSpeed(c WidgetCtx) {
	c.Panel()

	gear := c.Frame.Car.Gear
	gearStr := "N"
	if gear > 0 {
		gearStr = fmt.Sprintf("%d", gear)
	} else if gear < 0 {
		gearStr = "R"
	}
	c.FontNumber(c.H * 0.68)
	c.DC.SetColor(colTextPri)
	c.DC.DrawStringAnchored(gearStr, c.CX(), c.Y+c.H*0.45, 0.5, 0.5)

	c.FontNumber(c.H * 0.19)
	c.DC.DrawStringAnchored(c.FmtSpeed(float64(c.Frame.Car.SpeedMS)), c.CX(), c.Y+c.H*0.76, 0.5, 0.5)

	c.FontLabel(c.H * 0.08)
	c.DC.SetColor(colTextMuted)
	c.DC.DrawStringAnchored("km/h", c.CX(), c.Y+c.H*0.88, 0.5, 0.5)
}
