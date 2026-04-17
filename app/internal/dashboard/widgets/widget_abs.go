package widgets

const WidgetABS WidgetType = "abs"

type absWidget struct{}

func (absWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetABS, Name: "ABS", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{FontScale: 0.18},
		CapabilityBinding: "electronics.absAvailable",
		DefaultPanelRules: []ConditionalRule{
			{Property: "electronics.absActive", Op: RuleOpGT, Threshold: 0, Color: ColorRefABS, Alpha: 0.15},
		},
	}
}

func (absWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: "electronics.abs", Format: "int", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter,
			Color: ColorRefForeground.When(WhenActive("electronics.absActive", ColorRefWarning))},
	}
}

func init() { Register(absWidget{}) }
