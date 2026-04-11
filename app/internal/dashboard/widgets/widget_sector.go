package widgets

const WidgetSector WidgetType = "sector"

type sectorWidget struct{}

func (sectorWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetSector, Label: "Sector", Category: CategoryTiming,
		DefaultColSpan: 6, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 15,
	}
}

func (sectorWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "SECTORS", Font: FontLabel, FontScale: 0.12,
			X: 0.025, Y: 0.2, HAlign: HAlignStart, VAlign: VAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Text: "S1", Font: FontLabel, FontScale: 0.12,
			X: 0.025, Y: 0.5, HAlign: HAlignStart, VAlign: VAlignCenter,
			Color: ColorExpr{Ref: "muted", When: []ColorWhen{{Binding: "lap.sector1Active", Ref: "primary"}}}},
		{Kind: ElemText, Binding: "lap.sector1Time", Format: "sector", Font: FontMono, FontScale: 0.22,
			X: 0.025, Y: 0.78, HAlign: HAlignStart, VAlign: VAlignCenter, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Text: "S2", Font: FontLabel, FontScale: 0.12,
			X: 0.36, Y: 0.5, HAlign: HAlignStart, VAlign: VAlignCenter,
			Color: ColorExpr{Ref: "muted", When: []ColorWhen{{Binding: "lap.sector2Active", Ref: "primary"}}}},
		{Kind: ElemText, Binding: "lap.sector2Time", Format: "sector", Font: FontMono, FontScale: 0.22,
			X: 0.36, Y: 0.78, HAlign: HAlignStart, VAlign: VAlignCenter, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemDot, DotX: 0.7, DotY: 0.5, DotR: 0.07,
			Color: ColorExpr{Ref: "primary"}},
		{Kind: ElemText, Binding: "lap.sector", Format: "S%d", Font: FontLabel, FontScale: 0.12,
			X: 0.78, Y: 0.5, HAlign: HAlignStart, VAlign: VAlignCenter, Color: ColorExpr{Ref: "primary"}},
	}
}

func init() { Register(sectorWidget{}) }
