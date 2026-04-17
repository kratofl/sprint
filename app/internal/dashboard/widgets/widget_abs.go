package widgets

const WidgetABS WidgetType = "abs"

type absWidget struct{}

func (absWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetABS, Name: "ABS", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{FontScale: 0.18},
		CapabilityBinding: BindingElectronicsABSAvailable,
		DefaultPanelRules: []ConditionalRule{
			{Property: BindingElectronicsABSActive, Op: RuleOpGT, Threshold: 0, Color: ColorRefABS, Alpha: 0.15},
		},
	}
}

func (absWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: BindingElectronicsABS, Format: "int", Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.45, IsBold: true, HAlign: HAlignCenter,
			Color: ColorRefForeground.When(WhenActive(BindingElectronicsABSActive, ColorRefWarning))}},
	}
}

func init() { Register(absWidget{}) }
