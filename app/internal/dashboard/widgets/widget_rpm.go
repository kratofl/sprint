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
			X: 0.5, Y: 0.22, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "car.rpm", Format: "%.0f", Font: FontNumber, FontScale: 0.45,
			X: 0.5, Y: 0.6, HAlign: HAlignCenter, VAlign: VAlignCenter,
			Color: ColorExpr{Ref: "fg", When: []ColorWhen{{Binding: "car.rpmRedlineWarning", Ref: "warning"}}}},
	}
}

func init() { Register(rpmWidget{}) }
