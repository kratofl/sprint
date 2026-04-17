package widgets

const WidgetLapCounter WidgetType = "lap_counter"

type lapCounterWidget struct{}

func (lapCounterWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetLapCounter, Label: "Lap Counter", Category: CategoryTiming,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 5,
		Header: HeaderConfig{Text: "LAP", FontScale: 0.18, Align: HAlignCenter},
	}
}

func (lapCounterWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Binding: "lap.counterStr", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter, Color: ColorExpr{Ref: "fg"}},
	}
}

func init() { Register(lapCounterWidget{}) }
