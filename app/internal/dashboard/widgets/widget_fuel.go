package widgets

const WidgetFuel WidgetType = "fuel"

type fuelWidget struct{}

func (fuelWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetFuel, Label: "Fuel", Category: CategoryRace,
		DefaultColSpan: 5, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 5,
		DefaultPanelRules: []ConditionalRule{
			{Property: "car.fuel", Op: RuleOpLT, Threshold: 2, Color: "danger", Alpha: 0.20},
			{Property: "car.fuel", Op: RuleOpLT, Threshold: 5, Color: "warning", Alpha: 0.12},
		},
	}
}

func (fuelWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "FUEL", Font: FontLabel, FontScale: 0.12,
			Zone: "header", HAlign: HAlignStart, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "car.fuel", Format: "%.1f L", Font: FontNumber, FontScale: 0.32,
			Zone: "fill", HAlign: HAlignStart, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Binding: "car.fuelPerLap", Format: "%.2f L/lap", Font: FontMono, FontScale: 0.16,
			Zone: "fill", HAlign: HAlignEnd, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemCondition, CondBinding: "car.fuelLapsRemaining", CondAbove: 0,
			Then: []Element{
				{Kind: ElemText, Binding: "car.fuelLapsRemaining", Format: "~%.0f laps", Font: FontLabel, FontScale: 0.14,
					Zone: "footer", HAlign: HAlignStart, Color: ColorExpr{Ref: "muted"}},
			}},
	}
}

func init() { Register(fuelWidget{}) }
