package widgets

const WidgetIncidents WidgetType = "incidents"

type incidentsWidget struct{}

func (incidentsWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetIncidents, Name: "Incidents", Category: CategoryRace,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz2,
		Label: LabelConfig{FontScale: 0.18, Align: HAlignCenter},
		DefaultPanelRules: []ConditionalRule{
			{Property: "penalties.incidents", Op: RuleOpGT, Threshold: 3, Color: "danger", Alpha: 0.20},
			{Property: "penalties.incidents", Op: RuleOpGT, Threshold: 0, Color: "warning", Alpha: 0.12},
		},
	}
}

func (incidentsWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Binding: "penalties.incidents", Format: "int", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter,
			Color: ColorRefSuccess.When(
				WhenAbove("penalties.incidents", 3, ColorRefDanger),
				WhenAbove("penalties.incidents", 0, ColorRefWarning),
			)},
	}
}

func init() { Register(incidentsWidget{}) }
