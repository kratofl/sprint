package widgets

const WidgetLapCounter WidgetType = "lap_counter"

type lapCounterWidget struct{}

func (lapCounterWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetLapCounter, Label: "Lap Counter", Category: CategoryTiming,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 5,
	}
}

func (lapCounterWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "LAP", Font: FontLabel, FontScale: 0.18,
			X: 0.5, Y: 0.22, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "lap.counterStr", Font: FontNumber, FontScale: 0.45,
			X: 0.5, Y: 0.6, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "fg"}},
	}
}

func init() { Register(lapCounterWidget{}) }
