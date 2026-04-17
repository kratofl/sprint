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
		Text{Text: "S1", Font: FontLabel, FontScale: 0.12,
			Zone: "fill:0", HAlign: HAlignStart,
			Color: ColorRefMuted.When(WhenActive("lap.sector1Active", ColorRefPrimary))},
		Text{Binding: "lap.sector1Time", Format: "sector", Font: FontMono, FontScale: 0.22,
			Zone: "fill:1", HAlign: HAlignStart, Color: ColorRefForeground.Expr()},
		Text{Text: "S2", Font: FontLabel, FontScale: 0.12,
			Zone: "fill:0", X: 0.36, HAlign: HAlignStart,
			Color: ColorRefMuted.When(WhenActive("lap.sector2Active", ColorRefPrimary))},
		Text{Binding: "lap.sector2Time", Format: "sector", Font: FontMono, FontScale: 0.22,
			Zone: "fill:1", X: 0.36, HAlign: HAlignStart, Color: ColorRefForeground.Expr()},
		Dot{X: 0.7, Y: 0.5, R: 0.07,
			Color: ColorRefPrimary.Expr()},
		Text{Binding: "lap.sector", Format: "S%d", Font: FontLabel, FontScale: 0.12,
			Zone: "fill:0", X: 0.78, HAlign: HAlignStart, Color: ColorRefPrimary.Expr()},
	}
}

func init() { Register(sectorWidget{}) }
