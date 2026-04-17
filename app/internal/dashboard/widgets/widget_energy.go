package widgets

const WidgetEnergy WidgetType = "virtual_energy"

type energyWidget struct{}

func (energyWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetEnergy, Label: "Virtual Energy", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 15,
		Header: HeaderConfig{Text: "ENERGY", FontScale: 0.14, Align: HAlignCenter},
		DefaultPanelRules: []ConditionalRule{
			{Property: "energy.virtualEnergyPct", Op: RuleOpLT, Threshold: 20, Color: ColorRefEnergy, Alpha: 0.20},
			{Property: "energy.virtualEnergyPct", Op: RuleOpLT, Threshold: 40, Color: ColorRefEnergy, Alpha: 0.12},
		},
	}
}

func (energyWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Binding: "energy.virtualEnergyPct", Format: "%.1f%%", Font: FontNumber, FontScale: 0.42,
			Zone: "fill", HAlign: HAlignCenter, Color: ColorExpr{Ref: "success"}},
		{Kind: ElemText, Text: "REGEN", Font: FontLabel, FontScale: 0.12,
			Zone: "footer", HAlign: HAlignCenter, Color: ColorExpr{Ref: "muted"}},
	}
}

func init() { Register(energyWidget{}) }
