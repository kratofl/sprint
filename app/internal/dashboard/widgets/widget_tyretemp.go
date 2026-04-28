package widgets

const WidgetTyreTemp WidgetType = "tyre_temp"

type tyreTempWidget struct{}

func (tyreTempWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetTyreTemp, Name: "Tyre Temp", Category: CategoryRace,
		DefaultColSpan: 8, DefaultRowSpan: 4,
		IdleCapable: false, DefaultUpdateHz: Hz5,
		Label: LabelConfig{Text: "TYRE TEMPS", FontScale: 0.1},
	}
}

func (tyreTempWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Grid{Rows: 2, Cols: 2, Gap: 0.04, Cells: []GridCell{
			{Label: "FL", Binding: BindingTiresFLCoreTemp, Format: FormatTemp, ColorFn: "tyre_temp", LabelColor: ColorRefMuted.Expr()},
			{Label: "FR", Binding: BindingTiresFRCoreTemp, Format: FormatTemp, ColorFn: "tyre_temp", LabelColor: ColorRefMuted.Expr()},
			{Label: "RL", Binding: BindingTiresRLCoreTemp, Format: FormatTemp, ColorFn: "tyre_temp", LabelColor: ColorRefMuted.Expr()},
			{Label: "RR", Binding: BindingTiresRRCoreTemp, Format: FormatTemp, ColorFn: "tyre_temp", LabelColor: ColorRefMuted.Expr()},
		}},
	}
}

func init() { Register(tyreTempWidget{}) }
