package widgets

import (
	"image/color"
)

const WidgetLapTime WidgetType = "lap_time"

func init() { RegisterWidget(WidgetLapTime, "Lap Time", CategoryTiming, 5, 3, false, nil, drawWidgetLapTime) }

func drawWidgetLapTime(c WidgetCtx) {
	c.Panel()
	type lapEntry struct {
		label string
		time  float64
		col   color.RGBA
	}
	laps := []lapEntry{
		{"Current", c.Frame.Lap.CurrentLapTime, ColTextPri},
		{"Last", c.Frame.Lap.LastLapTime, ColTextPri},
		{"Best", c.Frame.Lap.BestLapTime, ColTeal},
	}
	c.FontLabel(c.H * 0.1)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawString("LAP TIMES", c.X+12, c.Y+c.H*0.15)
	for i, l := range laps {
		ly := c.Y + c.H*0.25 + float64(i)*(c.H*0.22)
		c.FontLabel(c.H * 0.12)
		c.DC.SetColor(ColTextSec)
		c.DC.DrawString(l.label, c.X+12, ly)
		c.FontNumber(c.H * 0.16)
		c.DC.SetColor(l.col)
		c.DC.DrawStringAnchored(c.FmtLap(l.time), c.X+c.W-12, ly-4, 1, 0)
	}
}
