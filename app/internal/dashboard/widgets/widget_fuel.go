package widgets

const WidgetFuel WidgetType = "fuel"

type fuelWidget struct{}

func (fuelWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetFuel, Name: "Fuel", Category: CategoryRace,
		DefaultColSpan: 5, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz5,
		DefaultPanelRules: []ConditionalRule{
			{Property: BindingCarFuel, Op: RuleOpLT, Threshold: 2, Color: "danger", Alpha: 0.20},
			{Property: BindingCarFuel, Op: RuleOpLT, Threshold: 5, Color: "warning", Alpha: 0.12},
		},
	}
}

func (fuelWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Grid{Rows: 2, Cols: 2, Cells: []GridCell{
			{Binding: BindingCarFuel, Format: "%.1f L", Style: TextStyle{Font: FontFamilyMono, FontSize: 0.64, IsBold: true, HAlign: HAlignStart, Color: ColorRefForeground.Expr()}},
			{Binding: BindingCarFuelPerLap, Format: "%.2f L/lap", Style: TextStyle{Font: FontFamilyMono, FontSize: 0.32, HAlign: HAlignEnd, Color: ColorRefSecondary.Expr()}},
			{Binding: BindingCarFuelLapsRemaining, Format: "~%.0f laps", Style: TextStyle{Font: FontFamilyUI, FontSize: 0.28, HAlign: HAlignStart, Color: ColorRefMuted.Expr()}},
			{},
		}},
	}
}

func init() { Register(fuelWidget{}) }
