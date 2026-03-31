package vocore

import (
	"image/color"

	"github.com/kratofl/sprint/app/internal/dash"
)

func init() { registerWidget(dash.WidgetLapTime, drawWidgetLapTime) }

func drawWidgetLapTime(c WidgetCtx) {
	c.Panel()
	type lapEntry struct {
		label string
		time  float64
		col   color.RGBA
	}
	laps := []lapEntry{
		{"Current", c.Frame.Lap.CurrentLapTime, colTextPri},
		{"Last", c.Frame.Lap.LastLapTime, colTextPri},
		{"Best", c.Frame.Lap.BestLapTime, colTeal},
	}
	c.FontLabel(c.H * 0.1)
	c.DC.SetColor(colTextMuted)
	c.DC.DrawString("LAP TIMES", c.X+12, c.Y+c.H*0.15)
	for i, l := range laps {
		ly := c.Y + c.H*0.25 + float64(i)*(c.H*0.22)
		c.FontLabel(c.H * 0.12)
		c.DC.SetColor(colTextSec)
		c.DC.DrawString(l.label, c.X+12, ly)
		c.FontNumber(c.H * 0.16)
		c.DC.SetColor(l.col)
		c.DC.DrawStringAnchored(c.FmtLap(l.time), c.X+c.W-12, ly-4, 1, 0)
	}
}
