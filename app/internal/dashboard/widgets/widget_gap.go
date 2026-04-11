package widgets

const WidgetGap WidgetType = "gap"

type gapWidget struct{}

func (gapWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGap, Label: "Gap", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 15,
	}
}

func (gapWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "GAP+", Font: FontLabel, FontScale: 0.14,
			X: 0.5, Y: 0.18, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "race.gapAhead", Format: "gap", Font: FontNumber, FontScale: 0.28,
			X: 0.5, Y: 0.34, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Text: "GAP-", Font: FontLabel, FontScale: 0.14,
			X: 0.5, Y: 0.62, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "race.gapBehind", Format: "gap", Font: FontNumber, FontScale: 0.28,
			X: 0.5, Y: 0.78, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorExpr{Ref: "fg"}},
	}
}

func init() { Register(gapWidget{}) }
