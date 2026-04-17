package widgets

const WidgetGap WidgetType = "gap"

type gapWidget struct{}

func (gapWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGap, Name: "Gap", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{Disabled: true},
	}
}

func (gapWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Text: "GAP+", Font: FontLabel, FontScale: 0.14,
			Zone: "fill:0", HAlign: HAlignCenter, Color: ColorRefMuted.Expr()},
		{Kind: ElemText, Binding: "race.gapAhead", Format: "gap", Font: FontNumber, FontScale: 0.28,
			Zone: "fill:1", HAlign: HAlignCenter, Color: ColorRefForeground.Expr()},
		{Kind: ElemText, Text: "GAP-", Font: FontLabel, FontScale: 0.14,
			Zone: "fill:2", HAlign: HAlignCenter, Color: ColorRefMuted.Expr()},
		{Kind: ElemText, Binding: "race.gapBehind", Format: "gap", Font: FontNumber, FontScale: 0.28,
			Zone: "fill:3", HAlign: HAlignCenter, Color: ColorRefForeground.Expr()},
	}
}

func init() { Register(gapWidget{}) }
