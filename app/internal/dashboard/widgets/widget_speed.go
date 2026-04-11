package widgets

const WidgetSpeed WidgetType = "speed"

type speedWidget struct{}

func (speedWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetSpeed, Label: "Speed", Category: CategoryCar,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 30,
	}
}

func (speedWidget) Draw(c WidgetCtx) {
	c.Panel()
	c.FontNumber(c.H * 0.45)
	c.DC.SetColor(ColTextPri)
	c.DC.DrawStringAnchored(c.FmtSpeed(float64(c.Frame.Car.SpeedMS)), c.CX(), c.Y+c.H*0.4, 0.5, 0.5)
	c.FontLabel(c.H * 0.18)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("km/h", c.CX(), c.Y+c.H*0.72, 0.5, 0.5)
}

func init() { Register(speedWidget{}) }
