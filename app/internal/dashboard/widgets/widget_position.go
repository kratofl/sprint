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
			X: 0.5, Y: 0.22, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "race.positionStr", Font: FontNumber, FontScale: 0.45,
			X: 0.5, Y: 0.6, AnchorX: 0.5, AnchorY: 0.5,
			Color: ColorExpr{Ref: "fg", When: []ColorWhen{{Binding: "race.positionP1", Ref: "primary"}}}},
	}
}

func init() { Register(positionWidget{}) }
