package widgets

const WidgetGear WidgetType = "gear"

type gearWidget struct{}

func (gearWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGear, Name: "Gear", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz30,
		Label: LabelConfig{Disabled: true},
	}
}

func (gearWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: "car.gearStr", Font: FontNumber, FontScale: 0.7,
			Zone: "fill", HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorRefForeground.Expr()},
	}
}

func init() { Register(gearWidget{}) }
