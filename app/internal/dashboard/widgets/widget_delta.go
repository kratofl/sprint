package widgets

const WidgetDelta WidgetType = "delta"

type deltaWidget struct{}

func (deltaWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetDelta, Label: "Delta", Category: CategoryTiming,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 30,
	}
}

func (deltaWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemCondition, CondBinding: "lap.targetLapTime", CondAbove: 0,
			Then: []Element{
				{Kind: ElemText, Text: "DELTA", Font: FontLabel, FontScale: 0.12,
					X: 0.5, Y: 0.18, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorExpr{Ref: "muted"}},
				{Kind: ElemDeltaBar, BarBinding: "lap.delta", MaxDelta: 2.0,
					BarX: 0.025, BarY: 0.4, BarW: 0.95, BarH: 0.3, BgColor: "surface",
					PosColor: ColorExpr{Ref: "danger"}, NegColor: ColorExpr{Ref: "accent"}},
				{Kind: ElemText, Binding: "lap.delta", Format: "delta", Font: FontNumber, FontScale: 0.18,
					X: 0.5, Y: 0.82, HAlign: HAlignCenter, VAlign: VAlignCenter,
					Color: ColorExpr{Ref: "accent", When: []ColorWhen{{Binding: "lap.deltaPositive", Ref: "danger"}}}},
			},
			Else: []Element{
				{Kind: ElemText, Text: "No target", Font: FontLabel, FontScale: 0.15,
					X: 0.5, Y: 0.5, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorExpr{Ref: "muted"}},
			}},
	}
}

func init() { Register(deltaWidget{}) }
