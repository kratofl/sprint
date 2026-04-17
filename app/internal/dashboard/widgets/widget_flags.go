package widgets

const WidgetFlags WidgetType = "flags"

type flagsWidget struct{}

func (flagsWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetFlags, Name: "Flags", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: true, DefaultUpdateHz: Hz30,
		Label: LabelConfig{Hidden: true},
	}
}

func (flagsWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Dot{X: 0.12, Y: 0.5, R: 0.18, Color: ColorDynamic(BindingFlagsColorRef)},
		Grid{Rows: 1, Cols: 2, ColWidths: []float64{0.36, 0.64}, Cells: []GridCell{
			{},
			{Binding: BindingFlagsActiveText, Style: TextStyle{
				Font: FontFamilyUI, FontSize: 0.32, IsBold: true,
				HAlign: HAlignCenter, Color: ColorDynamic(BindingFlagsColorRef)}},
		}},
	}
}

func init() { Register(flagsWidget{}) }
