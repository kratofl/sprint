package widgets

const WidgetABS WidgetType = "abs"

type absWidget struct{}

func (absWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetABS, Label: "ABS", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 15,
		CapabilityBinding: "electronics.absAvailable",
		DefaultPanelRules: []ConditionalRule{
			{Property: "electronics.absActive", Op: RuleOpGT, Threshold: 0, Color: ColorRefABS, Alpha: 0.15},
		},
	}
}

func (absWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "ABS", Font: FontLabel, FontScale: 0.18,
			Zone: "header", HAlign: HAlignStart, Color: ColorExpr{Ref: ColorRefMuted}},
		{Kind: ElemText, Binding: "electronics.abs", Format: "int", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter,
			Color: ColorExpr{Ref: ColorRefFG, When: []ColorWhen{{Binding: "electronics.absActive", Ref: ColorRefWarning}}}},
	}
}

func init() { Register(absWidget{}) }
