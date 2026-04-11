package widgets

const WidgetEnergy WidgetType = "virtual_energy"

type energyWidget struct{}

func (energyWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetEnergy, Label: "Virtual Energy", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 15,
	}
}

func (energyWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "ENERGY", Font: FontLabel, FontScale: 0.14,
			X: 0.5, Y: 0.16, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "energy.virtualEnergyPct", Format: "%.1f%%", Font: FontNumber, FontScale: 0.42,
			X: 0.5, Y: 0.5, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "success"}},
		{Kind: ElemHBar, BarBinding: "energy.virtualEnergy", BarX: 0.1, BarY: 0.82, BarW: 0.8, BarH: 0.08,
			BarColor: ColorExpr{Ref: "accent"}},
		{Kind: ElemText, Text: "REGEN", Font: FontLabel, FontScale: 0.12,
			X: 0.5, Y: 0.95, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
	}
}

func init() { Register(energyWidget{}) }
