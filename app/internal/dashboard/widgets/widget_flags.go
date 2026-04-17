package widgets

const WidgetFlags WidgetType = "flags"

type flagsWidget struct{}

func (flagsWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetFlags, Label: "Flags", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: true, DefaultUpdateHz: 30,
		Header: HeaderConfig{Disabled: true},
	}
}

func (flagsWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemDot, DotX: 0.12, DotY: 0.5, DotR: 0.18,
			Color: ColorExpr{DynamicRef: "flags.colorRef"}},
		{Kind: ElemText, Binding: "flags.activeText", Font: FontBold, FontScale: 0.32,
			Zone: "fill", X: 0.58, HAlign: HAlignCenter,
			Color: ColorExpr{DynamicRef: "flags.colorRef"}},
	}
}

func init() { Register(flagsWidget{}) }
