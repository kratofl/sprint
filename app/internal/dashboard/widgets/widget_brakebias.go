package widgets

const WidgetBrakeBias WidgetType = "brake_bias"

type brakeBiasWidget struct{}

func (brakeBiasWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetBrakeBias, Label: "Brake Bias", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 15,
		DefaultPanelRules: []ConditionalRule{
			{Property: "car.brakeBiasWarning", Op: RuleOpGT, Threshold: 0, Color: ColorRefBrakeBias, Alpha: 0.18},
		},
	}
}

func (brakeBiasWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "BRAKE BIAS", Font: FontLabel, FontScale: 0.18,
			Zone: "header", HAlign: HAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "car.brakeBiasPct", Format: "%.1f%%", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter,
			Color: ColorExpr{Ref: "fg", When: []ColorWhen{{Binding: "car.brakeBiasWarning", Ref: "warning"}}}},
	}
}

func init() { Register(brakeBiasWidget{}) }
