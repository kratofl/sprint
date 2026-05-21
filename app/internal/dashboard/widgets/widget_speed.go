package widgets

const WidgetSpeed WidgetType = "speed"

type speedWidget struct{}

func (speedWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetSpeed, Name: "Speed", Category: CategoryCar,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz30,
		Label: LabelConfig{Hidden: true},
	}
}

func (speedWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: BindingCarSpeedMS, Format: FormatSpeed, Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.45, IsBold: true, HAlign: HAlignCenter, Color: ColorRefForeground.Expr()}},
		Text{Text: "km/h", Style: TextStyle{
			Font: FontFamilyUI, FontSize: 0.18, HAlign: HAlignCenter, Color: ColorRefMuted.Expr()}},
	}
}

func init() { Register(speedWidget{}) }
