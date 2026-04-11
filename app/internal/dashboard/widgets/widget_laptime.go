package widgets

const WidgetLapTime WidgetType = "lap_time"

type lapTimeWidget struct{}

func (lapTimeWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetLapTime, Label: "Lap Time", Category: CategoryTiming,
		DefaultColSpan: 5, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 15,
	}
}

func (lapTimeWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "LAP TIMES", Font: FontLabel, FontScale: 0.1,
			X: 0.025, Y: 0.15, HAlign: HAlignStart, VAlign: VAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Text: "Current", Font: FontLabel, FontScale: 0.12,
			X: 0.025, Y: 0.3, HAlign: HAlignStart, VAlign: VAlignCenter, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemText, Binding: "lap.currentLapTime", Format: "lap", Font: FontNumber, FontScale: 0.16,
			X: 0.975, Y: 0.3, HAlign: HAlignEnd, VAlign: VAlignCenter, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Text: "Last", Font: FontLabel, FontScale: 0.12,
			X: 0.025, Y: 0.52, HAlign: HAlignStart, VAlign: VAlignCenter, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemText, Binding: "lap.lastLapTime", Format: "lap", Font: FontNumber, FontScale: 0.16,
			X: 0.975, Y: 0.52, HAlign: HAlignEnd, VAlign: VAlignCenter, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Text: "Best", Font: FontLabel, FontScale: 0.12,
			X: 0.025, Y: 0.74, HAlign: HAlignStart, VAlign: VAlignCenter, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemText, Binding: "lap.bestLapTime", Format: "lap", Font: FontNumber, FontScale: 0.16,
			X: 0.975, Y: 0.74, HAlign: HAlignEnd, VAlign: VAlignCenter, Color: ColorExpr{Ref: "accent"}},
	}
}

func init() { Register(lapTimeWidget{}) }
