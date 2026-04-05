package widgets

import (
	"fmt"
)

const WidgetFuel WidgetType = "fuel"

func init() { RegisterWidget(WidgetFuel, "Fuel", CategoryRace, 5, 3, false, nil, drawWidgetFuel) }

func drawWidgetFuel(c WidgetCtx) {
	c.Panel()
	c.FontLabel(c.H * 0.12)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawString("FUEL", c.X+12, c.Y+c.H*0.22)

	c.FontNumber(c.H * 0.32)
	c.DC.SetColor(ColTextPri)
	c.DC.DrawString(fmt.Sprintf("%.1f L", c.Frame.Car.Fuel), c.X+12, c.Y+c.H*0.58)

	c.FontMono(c.H * 0.16)
	c.DC.SetColor(ColTextSec)
	c.DC.DrawStringAnchored(fmt.Sprintf("%.2f L/lap", c.Frame.Car.FuelPerLap),
		c.X+c.W-12, c.Y+c.H*0.56, 1, 0)

	if c.Frame.Car.FuelPerLap > 0 {
		rem := float64(c.Frame.Car.Fuel) / float64(c.Frame.Car.FuelPerLap)
		c.FontLabel(c.H * 0.14)
		c.DC.SetColor(ColTextMuted)
		c.DC.DrawString(fmt.Sprintf("~%.0f laps", rem), c.X+12, c.Y+c.H-10)
	}
}
