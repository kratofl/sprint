package widgets

const WidgetSector WidgetType = "sector"

type sectorWidget struct{}

func (sectorWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetSector, Name: "Sector", Category: CategoryTiming,
		DefaultColSpan: 6, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{Text: "SECTORS"},
	}
}

func (sectorWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Grid{Rows: 2, Cols: 3, ColWidths: []float64{0.36, 0.42, 0.22}, Cells: []GridCell{
			{Text: "S1", Style: TextStyle{Font: FontFamilyUI, FontSize: 0.24, HAlign: HAlignStart,
				Color: ColorRefMuted.When(WhenActive(BindingLapSector1Active, ColorRefPrimary))}},
			{Text: "S2", Style: TextStyle{Font: FontFamilyUI, FontSize: 0.24, HAlign: HAlignStart,
				Color: ColorRefMuted.When(WhenActive(BindingLapSector2Active, ColorRefPrimary))}},
			{Binding: BindingLapSector, Format: "S%d", Style: TextStyle{Font: FontFamilyUI, FontSize: 0.24, HAlign: HAlignEnd, Color: ColorRefPrimary.Expr()}},
			{Binding: BindingLapSector1Time, Format: "sector", Style: TextStyle{Font: FontFamilyMono, FontSize: 0.44, HAlign: HAlignStart, Color: ColorRefForeground.Expr()}},
			{Binding: BindingLapSector2Time, Format: "sector", Style: TextStyle{Font: FontFamilyMono, FontSize: 0.44, HAlign: HAlignStart, Color: ColorRefForeground.Expr()}},
			{},
		}},
		Dot{X: 0.84, Y: 0.25, R: 0.07, Color: ColorRefPrimary.Expr()},
	}
}

func init() { Register(sectorWidget{}) }
