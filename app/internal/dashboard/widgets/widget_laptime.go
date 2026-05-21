package widgets

const WidgetLapTime WidgetType = "lap_time"

type lapTimeWidget struct{}

func (lapTimeWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetLapTime, Name: "Lap Time", Category: CategoryTiming,
		DefaultColSpan: 5, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{Text: "LAP TIMES", FontScale: 0.1},
	}
}

func (lapTimeWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Grid{Rows: 3, Cols: 2, Gap: 0.04, Cells: []GridCell{
			{Text: "Current", Style: TextStyle{Font: FontFamilyUI, FontSize: 0.36, HAlign: HAlignStart, Color: ColorRefSecondary.Expr()}},
			{Binding: BindingLapCurrentLapTime, Format: FormatLap, Style: TextStyle{Font: FontFamilyMono, FontSize: 0.48, IsBold: true, HAlign: HAlignEnd, Color: ColorRefForeground.Expr()}},
			{Text: "Last", Style: TextStyle{Font: FontFamilyUI, FontSize: 0.36, HAlign: HAlignStart, Color: ColorRefSecondary.Expr()}},
			{Binding: BindingLapLastLapTime, Format: FormatLap, Style: TextStyle{Font: FontFamilyMono, FontSize: 0.48, IsBold: true, HAlign: HAlignEnd, Color: ColorRefForeground.Expr()}},
			{Text: "Best", Style: TextStyle{Font: FontFamilyUI, FontSize: 0.36, HAlign: HAlignStart, Color: ColorRefSecondary.Expr()}},
			{Binding: BindingLapBestLapTime, Format: FormatLap, Style: TextStyle{Font: FontFamilyMono, FontSize: 0.48, IsBold: true, HAlign: HAlignEnd, Color: ColorRefAccent.Expr()}},
		}},
	}
}

func init() { Register(lapTimeWidget{}) }
