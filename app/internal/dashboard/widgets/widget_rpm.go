package widgets

const WidgetRPM WidgetType = "rpm"

type rpmWidget struct{}

func (rpmWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetRPM, Label: "RPM", Category: CategoryCar,
		DefaultColSpan: 2, DefaultRowSpan: 1,
		IdleCapable: false, DefaultUpdateHz: 30,
	}
}

func (rpmWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "RPM", Font: FontLabel, FontScale: 0.18,
			Zone: "header", HAlign: HAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "car.rpm", Format: "%.0f", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter,
			Color: ColorExpr{Ref: "fg", When: []ColorWhen{{Binding: "car.rpmRedlineWarning", Ref: "warning"}}}},
	}
}

func init() { Register(rpmWidget{}) }
