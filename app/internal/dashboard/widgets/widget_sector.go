package widgets

import (
	"fmt"
)

const WidgetSector WidgetType = "sector"

func init() {
	RegisterWidget(WidgetSector, "Sector", CategoryTiming, 6, 3, false, 15, nil, drawWidgetSector)
}

func drawWidgetSector(c WidgetCtx) {
	c.Panel()
	c.FontLabel(c.H * 0.12)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawString("SECTORS", c.X+12, c.Y+c.H*0.2)

	sw := (c.W - 36) / 3
	for i, st := range []float64{c.Frame.Lap.Sector1Time, c.Frame.Lap.Sector2Time} {
		sx := c.X + 12 + float64(i)*sw
		c.FontLabel(c.H * 0.12)
		c.DC.SetColor(ColTextMuted)
		c.DC.DrawString(fmt.Sprintf("S%d", i+1), sx, c.Y+c.H*0.5)
		c.FontMono(c.H * 0.22)
		c.DC.SetColor(ColTextPri)
		c.DC.DrawString(c.FmtSector(st), sx, c.Y+c.H*0.78)
	}
	c.FontLabel(c.H * 0.12)
	c.DC.SetColor(ColAccent)
	c.DC.DrawString(fmt.Sprintf("S%d ●", c.Frame.Lap.Sector), c.X+12+2*sw, c.Y+c.H*0.5)
}
