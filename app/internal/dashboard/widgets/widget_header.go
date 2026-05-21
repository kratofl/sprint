package widgets

const WidgetHeader WidgetType = "header"

type headerWidget struct{}

func (headerWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetHeader, Name: "Header", Category: CategoryLayout,
		DefaultColSpan: 20, DefaultRowSpan: 2,
		IdleCapable: true, DefaultUpdateHz: Hz5,
		Label: LabelConfig{Hidden: true},
	}
}

func (headerWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Grid{Rows: 1, Cols: 6, ColWidths: []float64{0.15, 0.27, 0.20, 0.22, 0.09, 0.07}, Cells: []GridCell{
			{Text: "SPRINT", Style: TextStyle{Font: FontFamilyUI, FontSize: 0.35, HAlign: HAlignStart, Color: ColorRefMuted.Expr()}},
			{Binding: BindingSessionTrack, Style: TextStyle{Font: FontFamilyUI, FontSize: 0.35, HAlign: HAlignStart, Color: ColorRefForeground.Expr()}},
			{Binding: BindingSessionCar, Style: TextStyle{Font: FontFamilyUI, FontSize: 0.35, HAlign: HAlignStart, Color: ColorRefSecondary.Expr()}},
			{Binding: BindingSessionType, Style: TextStyle{Font: FontFamilyUI, FontSize: 0.35, HAlign: HAlignStart, Color: ColorRefSecondary.Expr()}},
			{Binding: BindingLapCurrentLap, Format: "L%d", Style: TextStyle{Font: FontFamilyMono, FontSize: 0.30, HAlign: HAlignStart, Color: ColorRefMuted.Expr()}},
			{Text: "LIVE", Style: TextStyle{Font: FontFamilyUI, FontSize: 0.25, HAlign: HAlignEnd, Color: ColorRefAccent.Expr()}},
		}},
		Dot{X: 0.95, Y: 0.5, R: 0.08, Color: ColorRefAccent.Expr()},
	}
}

func init() { Register(headerWidget{}) }
