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
		{Kind: ElemDot, DotX: 0.12, DotY: 0.5, DotR: 0.18,
			Color: ColorDynamic("flags.colorRef")},
		{Kind: ElemText, Binding: "flags.activeText", Font: FontBold, FontScale: 0.32,
			Zone: "fill", X: 0.58, HAlign: HAlignCenter,
			Color: ColorDynamic("flags.colorRef")},
	}
}

func init() { Register(flagsWidget{}) }
