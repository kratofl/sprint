package widgets

const WidgetGear WidgetType = "gear"

type gearWidget struct{}

func (gearWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGear, Label: "Gear", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 30,
		Header: HeaderConfig{Disabled: true},
	}
}

func (gearWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Binding: "car.gearStr", Font: FontNumber, FontScale: 0.7,
			Zone: "fill", HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorExpr{Ref: ColorRefForeground}},
	}
}

func init() { Register(gearWidget{}) }
