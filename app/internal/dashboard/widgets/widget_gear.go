package widgets

const WidgetGear WidgetType = "gear"

type gearWidget struct{}

func (gearWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGear, Name: "Gear", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz30,
		Label: LabelConfig{Hidden: true},
	}
}

func (gearWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: BindingCarGearStr, X: 0.5, Y: 0.5, Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.7, IsBold: true,
			HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorRefForeground.Expr()}},
	}
}

func init() { Register(gearWidget{}) }
