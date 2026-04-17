package widgets

const WidgetDelta WidgetType = "delta"

type deltaWidget struct{}

func (deltaWidget) Meta() WidgetMeta {
return WidgetMeta{
Type: WidgetDelta, Name: "Delta", Category: CategoryTiming,
DefaultColSpan: 4, DefaultRowSpan: 3,
IdleCapable: false, DefaultUpdateHz: Hz30,
Label: LabelConfig{Hidden: true},
}
}

func (deltaWidget) Definition(_ map[string]any) []Element {
return []Element{
Condition{Binding: BindingLapTargetLapTime, Above: 0,
Then: ElementList{
Text{Text: "DELTA", Style: TextStyle{
Font: FontFamilyUI, FontSize: 0.12, HAlign: HAlignCenter, Color: ColorRefMuted.Expr()}},
Text{Binding: BindingLapDelta, Format: FormatDelta, Style: TextStyle{
Font: FontFamilyMono, FontSize: 0.35, IsBold: true, HAlign: HAlignCenter,
Color: ColorRefForeground.When(
WhenActive(BindingLapDeltaPositive, ColorRefDanger),
WhenActive(BindingLapDeltaNegative, ColorRefAccent),
)}},
},
Else: ElementList{
Text{Text: "No target", Style: TextStyle{
Font: FontFamilyUI, FontSize: 0.15, HAlign: HAlignCenter, Color: ColorRefMuted.Expr()}},
}},
}
}

func init() { Register(deltaWidget{}) }