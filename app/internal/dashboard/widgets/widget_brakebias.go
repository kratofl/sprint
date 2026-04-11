package widgets

const WidgetBrakeBias WidgetType = "brake_bias"

type brakeBiasWidget struct{}

func (brakeBiasWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetBrakeBias, Label: "Brake Bias", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 15,
		DefaultPanelRules: []ConditionalRule{
			{Property: "car.brakeBiasWarning", Op: RuleOpGT, Threshold: 0, Color: "warning", Alpha: 0.18},
		},
	}
}

func (brakeBiasWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "BRAKE BIAS", Font: FontLabel, FontScale: 0.18,
			X: 0.5, Y: 0.22, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "car.brakeBiasPct", Format: "%.1f%%", Font: FontNumber, FontScale: 0.45,
			X: 0.5, Y: 0.6, AnchorX: 0.5, AnchorY: 0.5,
			Color: ColorExpr{Ref: "fg", When: []ColorWhen{{Binding: "car.brakeBiasWarning", Ref: "warning"}}}},
	}
}

func init() { Register(brakeBiasWidget{}) }
