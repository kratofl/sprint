package widgets

const WidgetLapCounter WidgetType = "lap_counter"

type lapCounterWidget struct{}

func (lapCounterWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetLapCounter, Name: "Lap Counter", Category: CategoryTiming,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz5,
		Label: LabelConfig{Text: "LAP", FontScale: 0.18, Align: HAlignCenter},
	}
}

func (lapCounterWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: "lap.counterStr", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter, Color: ColorRefForeground.Expr()},
	}
}

func init() { Register(lapCounterWidget{}) }
