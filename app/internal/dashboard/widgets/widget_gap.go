package widgets

import "fmt"

const WidgetGap WidgetType = "gap"

func init() { RegisterWidget(WidgetGap, "Gap", CategoryRace, 4, 3, false, 15, nil, drawWidgetGap) }

func fmtGap(g float32) string {
	if g == 0 {
		return "---"
	}
	return fmt.Sprintf("+%.3f", g)
}

func drawWidgetGap(c WidgetCtx) {
	c.Panel()

	topY := c.Y + c.H*0.28
	botY := c.Y + c.H*0.72

	c.FontLabel(c.H * 0.14)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("GAP+", c.CX(), topY-c.H*0.1, 0.5, 0.5)
	c.DC.DrawStringAnchored("GAP-", c.CX(), botY-c.H*0.1, 0.5, 0.5)

	c.FontNumber(c.H * 0.28)
	c.DC.SetColor(ColTextPri)
	c.DC.DrawStringAnchored(fmtGap(c.Frame.Race.GapAhead), c.CX(), topY+c.H*0.06, 0.5, 0.5)
	c.DC.DrawStringAnchored(fmtGap(c.Frame.Race.GapBehind), c.CX(), botY+c.H*0.06, 0.5, 0.5)
}
