package widgets

const WidgetGap WidgetType = "gap"

type gapWidget struct{}

func (gapWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGap, Name: "Gap", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{Hidden: true},
	}
}

func (gapWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Text: "GAP+", Style: TextStyle{
			Font: FontFamilyUI, FontSize: 0.14, HAlign: HAlignCenter, Color: ColorRefMuted.Expr()}},
		Text{Binding: BindingRaceGapAhead, Format: "gap", Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.28, IsBold: true, HAlign: HAlignCenter, Color: ColorRefForeground.Expr()}},
		Text{Text: "GAP-", Style: TextStyle{
			Font: FontFamilyUI, FontSize: 0.14, HAlign: HAlignCenter, Color: ColorRefMuted.Expr()}},
		Text{Binding: BindingRaceGapBehind, Format: "gap", Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.28, IsBold: true, HAlign: HAlignCenter, Color: ColorRefForeground.Expr()}},
	}
}

func init() { Register(gapWidget{}) }
