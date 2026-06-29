package widgets

const WidgetSpeed WidgetType = "speed"

type speedWidget struct{}

func (speedWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetSpeed, Name: "Speed", Category: CategoryDriving,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz30,
		Label: LabelConfig{Hidden: true},
		// Primary readout — open (no frame).
		Panel: PanelConfig{Disabled: true},
	}
}

func (speedWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: BindingCarSpeedMS, Format: FormatSpeed, X: 0.5, Y: 0.43, Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.5, IsBold: true, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorRefForeground.Expr()}},
		Text{Text: "km/h", X: 0.5, Y: 0.78, Style: TextStyle{
			Font: FontFamilyUI, FontSize: 0.14, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorRefMuted.Expr()}},
	}
}

func init() { Register(speedWidget{}) }
