package widgets

const WidgetLapTime WidgetType = "lap_time"

type lapTimeWidget struct{}

func (lapTimeWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetLapTime, Label: "Lap Time", Category: CategoryTiming,
		DefaultColSpan: 5, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 15,
		Header: HeaderConfig{Text: "LAP TIMES", FontScale: 0.1},
	}
}

func (lapTimeWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Text: "Current", Font: FontLabel, FontScale: 0.12,
			Zone: "fill:0", HAlign: HAlignStart, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemText, Binding: "lap.currentLapTime", Format: "lap", Font: FontNumber, FontScale: 0.16,
			Zone: "fill:0", HAlign: HAlignEnd, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Text: "Last", Font: FontLabel, FontScale: 0.12,
			Zone: "fill:1", HAlign: HAlignStart, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemText, Binding: "lap.lastLapTime", Format: "lap", Font: FontNumber, FontScale: 0.16,
			Zone: "fill:1", HAlign: HAlignEnd, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Text: "Best", Font: FontLabel, FontScale: 0.12,
			Zone: "fill:2", HAlign: HAlignStart, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemText, Binding: "lap.bestLapTime", Format: "lap", Font: FontNumber, FontScale: 0.16,
			Zone: "fill:2", HAlign: HAlignEnd, Color: ColorExpr{Ref: "accent"}},
	}
}

func init() { Register(lapTimeWidget{}) }
