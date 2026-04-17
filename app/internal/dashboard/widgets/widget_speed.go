package widgets

const WidgetSpeed WidgetType = "speed"

type speedWidget struct{}

func (speedWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetSpeed, Name: "Speed", Category: CategoryCar,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz30,
		Label: LabelConfig{Disabled: true},
	}
}

func (speedWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Binding: "car.speedMS", Format: "speed", Font: FontNumber, FontScale: 0.45,
			Zone: "fill:0", HAlign: HAlignCenter, Color: ColorRefForeground.Expr()},
		{Kind: ElemText, Text: "km/h", Font: FontLabel, FontScale: 0.18,
			Zone: "fill:1", HAlign: HAlignCenter, Color: ColorRefMuted.Expr()},
	}
}

func init() { Register(speedWidget{}) }
