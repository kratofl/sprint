package widgets

const WidgetIncidents WidgetType = "incidents"

type incidentsWidget struct{}

func (incidentsWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetIncidents, Label: "Incidents", Category: CategoryRace,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 2,
		DefaultPanelRules: []ConditionalRule{
			{Property: "penalties.incidents", Op: RuleOpGT, Threshold: 3, Color: "danger", Alpha: 0.20},
			{Property: "penalties.incidents", Op: RuleOpGT, Threshold: 0, Color: "warning", Alpha: 0.12},
		},
	}
}

func (incidentsWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "INCIDENTS", Font: FontLabel, FontScale: 0.18,
			X: 0.5, Y: 0.22, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "penalties.incidents", Format: "int", Font: FontNumber, FontScale: 0.45,
			X: 0.5, Y: 0.6, AnchorX: 0.5, AnchorY: 0.5,
			Color: ColorExpr{
				Ref: "success",
				When: []ColorWhen{
					{Binding: "penalties.incidents", Above: 3, Ref: "danger"},
					{Binding: "penalties.incidents", Above: 0, Ref: "warning"},
				},
			}},
	}
}

func init() { Register(incidentsWidget{}) }
