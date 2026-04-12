package widgets

const WidgetPosition WidgetType = "position"

type positionWidget struct{}

func (positionWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetPosition, Label: "Position", Category: CategoryRace,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 2,
	}
}

func (positionWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "POSITION", Font: FontLabel, FontScale: 0.18,
			Zone: "header", HAlign: HAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "race.positionStr", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter,
			Color: ColorExpr{Ref: "fg", When: []ColorWhen{{Binding: "race.positionP1", Ref: "primary"}}}},
	}
}

func init() { Register(positionWidget{}) }
