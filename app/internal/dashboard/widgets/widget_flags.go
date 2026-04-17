package widgets

const WidgetFlags WidgetType = "flags"

type flagsWidget struct{}

func (flagsWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetFlags, Name: "Flags", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: true, DefaultUpdateHz: Hz30,
		Label: LabelConfig{Disabled: true},
	}
}

func (flagsWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Dot{X: 0.12, Y: 0.5, R: 0.18,
			Color: ColorDynamic("flags.colorRef")},
		Text{Binding: "flags.activeText", Font: FontBold, FontScale: 0.32,
			Zone: "fill", X: 0.58, HAlign: HAlignCenter,
			Color: ColorDynamic("flags.colorRef")},
	}
}

func init() { Register(flagsWidget{}) }
