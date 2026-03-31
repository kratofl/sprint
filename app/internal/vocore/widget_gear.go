package vocore

import (
	"fmt"

	"github.com/kratofl/sprint/app/internal/dash"
)

func init() { registerWidget(dash.WidgetGear, drawWidgetGear) }

func drawWidgetGear(c WidgetCtx) {
	c.Panel()
	gear := c.Frame.Car.Gear
	gearStr := "N"
	if gear > 0 {
		gearStr = fmt.Sprintf("%d", gear)
	} else if gear < 0 {
		gearStr = "R"
	}
	c.FontNumber(c.H * 0.7)
	c.DC.SetColor(colTextPri)
	c.DC.DrawStringAnchored(gearStr, c.CX(), c.Y+c.H*0.45, 0.5, 0.5)
}
