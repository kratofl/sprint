package widgets

import "image/color"

const WidgetFlags WidgetType = "flags"

func init() {
	RegisterWidget(WidgetFlags, "Flags", CategoryRace, 4, 2, false, nil, drawWidgetFlags)
}

func drawWidgetFlags(c WidgetCtx) {
	c.Panel()

	fl := c.Frame.Flags
	var text string
	var col color.RGBA

	switch {
	case fl.Red:
		text, col = "RED", ColDanger
	case fl.SafetyCar:
		text, col = "SAFETY CAR", ColWarning
	case fl.VSC:
		text, col = "VSC", ColWarning
	case fl.DoubleYellow:
		text, col = "DBL YELLOW", ColWarning
	case fl.Yellow:
		text, col = "YELLOW", ColWarning
	case fl.Checkered:
		text, col = "CHECKERED", ColTextPri
	default:
		text, col = "GREEN", ColSuccess
	}

	dotSize := c.H * 0.22
	dotX := c.X + c.W*0.12
	dotY := c.CY() - dotSize/2
	c.DC.SetColor(col)
	c.DC.DrawRoundedRectangle(dotX, dotY, dotSize, dotSize, 3)
	c.DC.Fill()

	c.FontBold(c.H * 0.32)
	c.DC.SetColor(col)
	c.DC.DrawStringAnchored(text, c.X+c.W*0.12+dotSize+c.W*0.04+c.W*0.3, c.CY(), 0.5, 0.5)
}
