package widgets

const WidgetTyreTemp WidgetType = "tyre_temp"

type tyreTempWidget struct{}

func (tyreTempWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetTyreTemp, Label: "Tyre Temp", Category: CategoryRace,
		DefaultColSpan: 10, DefaultRowSpan: 4,
		IdleCapable: false, DefaultUpdateHz: 5,
	}
}

func (tyreTempWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "TYRE TEMPS", Font: FontLabel, FontScale: 0.1,
			X: 0.025, Y: 0.18, AnchorX: 0, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemTyreGrid},
	}
}

func init() { Register(tyreTempWidget{}) }
