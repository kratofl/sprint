package widgets

const WidgetDelta WidgetType = "delta"

type deltaWidget struct{}

func (deltaWidget) Meta() WidgetMeta {
return WidgetMeta{
Type: WidgetDelta, Name: "Delta", Category: CategoryTiming,
DefaultColSpan: 4, DefaultRowSpan: 3,
IdleCapable: false, DefaultUpdateHz: Hz30,
Label: LabelConfig{Disabled: true},
}
}

func (deltaWidget) Definition(_ map[string]any) []Element {
return []Element{
{Kind: ElemCondition, CondBinding: "lap.targetLapTime", CondAbove: 0,
Then: []Element{
{Kind: ElemText, Text: "DELTA", Font: FontLabel, FontScale: 0.12,
Zone: "header", HAlign: HAlignCenter, Color: ColorRefMuted.Expr()},
{Kind: ElemText, Binding: "lap.delta", Format: "delta", Font: FontNumber, FontScale: 0.35,
Zone: "fill", HAlign: HAlignCenter,
Color: ColorRefForeground.When(
WhenActive("lap.deltaPositive", ColorRefDanger),
WhenActive("lap.deltaNegative", ColorRefAccent),
)},
},
Else: []Element{
{Kind: ElemText, Text: "No target", Font: FontLabel, FontScale: 0.15,
Zone: "fill", HAlign: HAlignCenter, Color: ColorRefMuted.Expr()},
}},
}
}

func init() { Register(deltaWidget{}) }