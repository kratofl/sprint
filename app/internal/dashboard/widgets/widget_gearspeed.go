package widgets

import (
	"fmt"
)

const WidgetGearSpeed WidgetType = "gear_speed"

func init() {
	RegisterWidget(WidgetGearSpeed, "Gear + Speed", CategoryCar, 5, 3, false, 30, nil, drawWidgetGearSpeed)
}

// drawWidgetGearSpeed renders the combined gear + speed panel: a large gear
// number in the upper portion and the current speed with a "km/h" label below.
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
	c.DC.SetColor(ColTextPri)
	c.DC.DrawStringAnchored(gearStr, c.CX(), c.Y+c.H*0.45, 0.5, 0.5)

	c.FontNumber(c.H * 0.19)
	c.DC.DrawStringAnchored(c.FmtSpeed(float64(c.Frame.Car.SpeedMS)), c.CX(), c.Y+c.H*0.76, 0.5, 0.5)

	c.FontLabel(c.H * 0.08)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("km/h", c.CX(), c.Y+c.H*0.88, 0.5, 0.5)
}
