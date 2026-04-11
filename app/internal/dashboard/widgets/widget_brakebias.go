package widgets

import "fmt"

const WidgetBrakeBias WidgetType = "brake_bias"

type brakeBiasWidget struct{}

func (brakeBiasWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetBrakeBias, Label: "Brake Bias", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 15,
	}
}

func (brakeBiasWidget) Draw(c WidgetCtx) {
	c.Panel()
	c.FontLabel(c.H * 0.18)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("BRAKE BIAS", c.CX(), c.Y+c.H*0.22, 0.5, 0.5)

	bias := c.Frame.Car.BrakeBiasRear
	col := ColTextPri
	if bias < 0.45 {
		col = ColWarning
	}

	c.FontNumber(c.H * 0.45)
	c.DC.SetColor(col)
	c.DC.DrawStringAnchored(fmt.Sprintf("%.1f%%", float64(bias)*100), c.CX(), c.CY()+c.H*0.1, 0.5, 0.5)
}

func init() { Register(brakeBiasWidget{}) }
