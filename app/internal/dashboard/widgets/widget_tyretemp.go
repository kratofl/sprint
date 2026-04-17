package widgets

const WidgetTyreTemp WidgetType = "tyre_temp"

type tyreTempWidget struct{}

func (tyreTempWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetTyreTemp, Name: "Tyre Temp", Category: CategoryRace,
		DefaultColSpan: 10, DefaultRowSpan: 4,
		IdleCapable: false, DefaultUpdateHz: Hz5,
		Label: LabelConfig{Text: "TYRE TEMPS", FontScale: 0.1},
	}
}

func (tyreTempWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Grid{Rows: 2, Cols: 2, Gap: 0.04, Cells: []GridCell{
			{Label: "FL", Binding: "tires.fl.avgTemp", Format: "temp", ColorFn: "tyre_temp", LabelColor: ColorRefMuted.Expr()},
			{Label: "FR", Binding: "tires.fr.avgTemp", Format: "temp", ColorFn: "tyre_temp", LabelColor: ColorRefMuted.Expr()},
			{Label: "RL", Binding: "tires.rl.avgTemp", Format: "temp", ColorFn: "tyre_temp", LabelColor: ColorRefMuted.Expr()},
			{Label: "RR", Binding: "tires.rr.avgTemp", Format: "temp", ColorFn: "tyre_temp", LabelColor: ColorRefMuted.Expr()},
		}},
	}
}

func init() { Register(tyreTempWidget{}) }
