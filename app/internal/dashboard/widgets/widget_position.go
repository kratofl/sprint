package widgets

import "fmt"

const WidgetPosition WidgetType = "position"

type positionWidget struct{}

func (positionWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetPosition, Label: "Position", Category: CategoryRace,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 2,
	}
}

func (positionWidget) Draw(c WidgetCtx) {
	c.Panel()
	c.FontLabel(c.H * 0.18)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("POSITION", c.CX(), c.Y+c.H*0.22, 0.5, 0.5)

	pos := c.Frame.Race.Position
	var posStr string
	var col = ColTextPri
	if pos == 0 {
		posStr = "---"
	} else {
		posStr = fmt.Sprintf("P%d", pos)
		if pos == 1 {
			col = ColAccent
		}
	}

	c.FontNumber(c.H * 0.45)
	c.DC.SetColor(col)
	c.DC.DrawStringAnchored(posStr, c.CX(), c.CY()+c.H*0.1, 0.5, 0.5)
}

func init() { Register(positionWidget{}) }
