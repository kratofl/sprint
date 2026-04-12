package widgets

const WidgetGear WidgetType = "gear"

type gearWidget struct{}

func (gearWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGear, Label: "Gear", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 30,
	}
}

func (gearWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Binding: "car.gearStr", Font: FontNumber, FontScale: 0.7,
			Zone: "fill", HAlign: HAlignCenter, Color: ColorExpr{Ref: "fg"}},
	}
}

func init() { Register(gearWidget{}) }
