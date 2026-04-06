package widgets

import (
	"fmt"
)

const WidgetTyreTemp WidgetType = "tyre_temp"

func init() {
	RegisterWidget(WidgetTyreTemp, "Tyre Temp", CategoryRace, 10, 4, false, 5, nil, drawWidgetTyreTemp)
}

func drawWidgetTyreTemp(c WidgetCtx) {
	c.Panel()
	c.FontLabel(c.H * 0.1)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawString("TYRE TEMPS", c.X+12, c.Y+c.H*0.18)

	tireLabels := [4]string{"FL", "FR", "RL", "RR"}
	tw := (c.W - 36) / 2
	for i, tire := range c.Frame.Tires {
		col := i % 2
		row := i / 2
		tx := c.X + 12 + float64(col)*(tw+12)
		ty := c.Y + c.H*0.3 + float64(row)*(c.H*0.32)
		avgTemp := (float64(tire.TempInner) + float64(tire.TempMiddle) + float64(tire.TempOuter)) / 3
		c.FontLabel(c.H * 0.12)
		c.DC.SetColor(ColTextMuted)
		c.DC.DrawString(tireLabels[i], tx, ty)
		c.FontNumber(c.H * 0.2)
		c.DC.SetColor(TyreColor(avgTemp))
		c.DC.DrawStringAnchored(fmt.Sprintf("%.0f°", avgTemp), tx+tw, ty-2, 1, 0)
	}
}
