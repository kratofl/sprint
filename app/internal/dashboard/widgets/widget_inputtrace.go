package widgets

import (
	"image/color"
)

const WidgetInputTrace WidgetType = "input_trace"

func init() {
	RegisterWidget(WidgetInputTrace, "Inputs", CategoryCar, 6, 3, false, 30, nil, drawWidgetInputTrace)
}

func drawWidgetInputTrace(c WidgetCtx) {
	c.Panel()
	c.FontLabel(c.H * 0.08)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawString("INPUTS", c.X+10, c.Y+c.H*0.14)

	barX := c.X + 52.0
	barW := c.W - 62.0
	barH := c.H * 0.12
	rowH := c.H / 4

	type inputRow struct {
		label string
		value float64
		col   color.RGBA
	}
	steerNorm := (float64(c.Frame.Car.Steering) + 1.0) / 2.0
	rows := []inputRow{
		{"THR", float64(c.Frame.Car.Throttle), ColSuccess},
		{"BRK", float64(c.Frame.Car.Brake), ColDanger},
		{"CLU", float64(c.Frame.Car.Clutch), ColTextSec},
		{"STR", steerNorm, ColTextSec},
	}
	for i, row := range rows {
		cy := c.Y + rowH*(float64(i)+0.5)
		c.FontLabel(c.H * 0.09)
		c.DC.SetColor(ColTextMuted)
		c.DC.DrawStringAnchored(row.label, c.X+34, cy, 1, 0.5)
		if i == 3 {
			c.HBarCentered(barX, cy-barH/2, barW, barH, row.value, row.col)
		} else {
			c.HBar(barX, cy-barH/2, barW, barH, row.value, row.col)
		}
	}
}
