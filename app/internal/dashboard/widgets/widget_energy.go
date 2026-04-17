package widgets

const WidgetEnergy WidgetType = "virtual_energy"

type energyWidget struct{}

func (energyWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetEnergy, Name: "Virtual Energy", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{Text: "ENERGY", FontScale: 0.14, Align: HAlignCenter},
		DefaultPanelRules: []ConditionalRule{
			{Property: BindingEnergyVirtualPct, Op: RuleOpLT, Threshold: 20, Color: ColorRefEnergy, Alpha: 0.20},
			{Property: BindingEnergyVirtualPct, Op: RuleOpLT, Threshold: 40, Color: ColorRefEnergy, Alpha: 0.12},
		},
	}
}

func (energyWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: BindingEnergyVirtualPct, Format: "%.1f%%", Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.42, IsBold: true, HAlign: HAlignCenter, Color: ColorRefSuccess.Expr()}},
		Text{Text: "REGEN", Style: TextStyle{
			Font: FontFamilyUI, FontSize: 0.12, HAlign: HAlignCenter, Color: ColorRefMuted.Expr()}},
	}
}

func init() { Register(energyWidget{}) }
