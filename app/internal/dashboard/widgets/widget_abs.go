package widgets

import "fmt"

const WidgetABS WidgetType = "abs"

type absWidget struct{}

func (absWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetABS, Label: "ABS", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 15,
	}
}

func (absWidget) Draw(c WidgetCtx) {
	if c.Frame.Electronics.ABSActive {
		c.DC.SetColor(DimColor(ColWarning, 0.15))
		c.DC.DrawRectangle(c.X, c.Y, c.W, c.H)
		c.DC.Fill()
	}
	c.Panel()

	c.FontLabel(c.H * 0.18)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("ABS", c.CX(), c.Y+c.H*0.22, 0.5, 0.5)

	e := c.Frame.Electronics
	col := ColTextPri
	if e.ABSActive {
		col = ColWarning
	}

	c.FontNumber(c.H * 0.45)
	c.DC.SetColor(col)
	var valStr string
	valStr = fmt.Sprintf("%d", e.ABS)
	// if e.ABSMax == 0 {
	// 	valStr = fmt.Sprintf("%d", e.ABS)
	// } else {
	// 	valStr = fmt.Sprintf("%d / %d", e.ABS, e.ABSMax)
	// }
	c.DC.DrawStringAnchored(valStr, c.CX(), c.CY()+c.H*0.1, 0.5, 0.5)
}

func init() { Register(absWidget{}) }
