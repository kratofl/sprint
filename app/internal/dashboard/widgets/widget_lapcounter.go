package widgets

import "fmt"

const WidgetLapCounter WidgetType = "lap_counter"

type lapCounterWidget struct{}

func (lapCounterWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetLapCounter, Label: "Lap Counter", Category: CategoryTiming,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 5,
	}
}

func (lapCounterWidget) Draw(c WidgetCtx) {
	c.Panel()
	c.FontLabel(c.H * 0.18)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("LAP", c.CX(), c.Y+c.H*0.22, 0.5, 0.5)

	lap := c.Frame.Lap.CurrentLap
	maxLaps := c.Frame.Session.MaxLaps

	c.FontNumber(c.H * 0.45)
	c.DC.SetColor(ColTextPri)
	if maxLaps == 0 {
		c.DC.DrawStringAnchored(fmt.Sprintf("%d", lap), c.CX(), c.CY()+c.H*0.1, 0.5, 0.5)
	} else {
		lapStr := fmt.Sprintf("%d", lap)
		maxStr := fmt.Sprintf(" / %d", maxLaps)
		w1, _ := c.DC.MeasureString(lapStr)
		c.FontNumber(c.H * 0.4)
		w2, _ := c.DC.MeasureString(maxStr)
		cx := c.CX() - (w1+w2)/2
		cy := c.CY() + c.H*0.1
		c.DC.SetColor(ColTextPri)
		c.DC.DrawString(lapStr, cx, cy)
		c.FontNumber(c.H * 0.28)
		c.DC.SetColor(ColTextMuted)
		c.DC.DrawString(maxStr, cx+w1, cy)
	}
}

func init() { Register(lapCounterWidget{}) }
