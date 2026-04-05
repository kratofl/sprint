package widgets

import (
	"fmt"
)

const WidgetGear WidgetType = "gear"

func init() { RegisterWidget(WidgetGear, "Gear", CategoryCar, 3, 3, false, nil, drawWidgetGear) }

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
	c.DC.SetColor(ColTextPri)
	c.DC.DrawStringAnchored(gearStr, c.CX(), c.Y+c.H*0.45, 0.5, 0.5)
}
