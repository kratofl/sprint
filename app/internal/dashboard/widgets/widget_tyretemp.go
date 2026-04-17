package widgets

const WidgetTyreTemp WidgetType = "tyre_temp"

type tyreTempWidget struct{}

func (tyreTempWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetTyreTemp, Label: "Tyre Temp", Category: CategoryRace,
		DefaultColSpan: 10, DefaultRowSpan: 4,
		IdleCapable: false, DefaultUpdateHz: 5,
		Header: HeaderConfig{Text: "TYRE TEMPS", FontScale: 0.1},
	}
}

func (tyreTempWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemGrid, GridRows: 2, GridCols: 2, GridGap: 0.04, GridCells: []GridCell{
			{Label: "FL", Binding: "tires.fl.avgTemp", Format: "temp", ColorFn: "tyre_temp", LabelColor: ColorExpr{Ref: "muted"}},
			{Label: "FR", Binding: "tires.fr.avgTemp", Format: "temp", ColorFn: "tyre_temp", LabelColor: ColorExpr{Ref: "muted"}},
			{Label: "RL", Binding: "tires.rl.avgTemp", Format: "temp", ColorFn: "tyre_temp", LabelColor: ColorExpr{Ref: "muted"}},
			{Label: "RR", Binding: "tires.rr.avgTemp", Format: "temp", ColorFn: "tyre_temp", LabelColor: ColorExpr{Ref: "muted"}},
		}},
	}
}

func init() { Register(tyreTempWidget{}) }
