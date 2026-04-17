package widgets

const WidgetBrakeBias WidgetType = "brake_bias"

type brakeBiasWidget struct{}

func (brakeBiasWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetBrakeBias, Name: "Brake Bias", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{FontScale: 0.18, Align: HAlignCenter},
		DefaultPanelRules: []ConditionalRule{
			{Property: BindingCarBrakeBiasWarning, Op: RuleOpGT, Threshold: 0, Color: ColorRefBrakeBias, Alpha: 0.18},
		},
	}
}

func (brakeBiasWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: BindingCarBrakeBiasPct, Format: "%.1f%%", Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.45, IsBold: true, HAlign: HAlignCenter,
			Color: ColorRefForeground.When(WhenActive(BindingCarBrakeBiasWarning, ColorRefWarning))}},
	}
}

func init() { Register(brakeBiasWidget{}) }
