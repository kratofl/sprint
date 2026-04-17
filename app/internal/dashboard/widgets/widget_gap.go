package widgets

const WidgetGap WidgetType = "gap"

type gapWidget struct{}

func (gapWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGap, Label: "Gap", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 15,
		Header: HeaderConfig{Disabled: true},
	}
}

func (gapWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Text: "GAP+", Font: FontLabel, FontScale: 0.14,
			Zone: "fill:0", HAlign: HAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "race.gapAhead", Format: "gap", Font: FontNumber, FontScale: 0.28,
			Zone: "fill:1", HAlign: HAlignCenter, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Text: "GAP-", Font: FontLabel, FontScale: 0.14,
			Zone: "fill:2", HAlign: HAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "race.gapBehind", Format: "gap", Font: FontNumber, FontScale: 0.28,
			Zone: "fill:3", HAlign: HAlignCenter, Color: ColorExpr{Ref: "fg"}},
	}
}

func init() { Register(gapWidget{}) }
