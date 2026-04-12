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
					Zone: "header", HAlign: HAlignCenter, Color: ColorExpr{Ref: "muted"}},
				{Kind: ElemText, Binding: "lap.delta", Format: "delta", Font: FontNumber, FontScale: 0.18,
					Zone: "fill", HAlign: HAlignCenter,
					Color: ColorExpr{Ref: "accent", When: []ColorWhen{{Binding: "lap.deltaPositive", Ref: "danger"}}}},
			},
			Else: []Element{
				{Kind: ElemText, Text: "No target", Font: FontLabel, FontScale: 0.15,
					Zone: "fill", HAlign: HAlignCenter, Color: ColorExpr{Ref: "muted"}},
			}},
	}
}

func init() { Register(deltaWidget{}) }
