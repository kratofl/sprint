package widgets

import (
	"fmt"
)

const WidgetGear WidgetType = "gear"

type gearWidget struct{}

func (gearWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGear, Label: "Gear", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 30,
	}
}

func (gearWidget) Draw(c WidgetCtx) {
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

func init() { Register(gearWidget{}) }
