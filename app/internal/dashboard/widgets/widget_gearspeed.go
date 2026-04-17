package widgets

const WidgetGearSpeed WidgetType = "gear_speed"

type gearSpeedWidget struct{}

func (gearSpeedWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGearSpeed, Name: "Gear + Speed", Category: CategoryCar,
		DefaultColSpan: 5, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz30,
		Label: LabelConfig{Hidden: true},
	}
}

func (gearSpeedWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: BindingCarGearStr, Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.68, IsBold: true, HAlign: HAlignCenter, Color: ColorRefForeground.Expr()}},
		Text{Binding: BindingCarSpeedMS, Format: "speed", Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.19, IsBold: true, HAlign: HAlignCenter, Color: ColorRefForeground.Expr()}},
		Text{Text: "km/h", Style: TextStyle{
			Font: FontFamilyUI, FontSize: 0.08, HAlign: HAlignCenter, Color: ColorRefMuted.Expr()}},
	}
}

func init() { Register(gearSpeedWidget{}) }
