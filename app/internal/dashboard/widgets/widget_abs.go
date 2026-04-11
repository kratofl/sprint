package widgets

const WidgetABS WidgetType = "abs"

type absWidget struct{}

func (absWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetABS, Label: "ABS", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 15,
		DefaultPanelRules: []ConditionalRule{
			{Property: "electronics.absActive", Op: RuleOpGT, Threshold: 0, Color: ColorRefABS, Alpha: 0.15},
		},
	}
}

func (absWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "ABS", Font: FontLabel, FontScale: 0.18,
			X: 0.5, Y: 0.22, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "electronics.abs", Format: "int", Font: FontNumber, FontScale: 0.45,
			X: 0.5, Y: 0.6, AnchorX: 0.5, AnchorY: 0.5,
			Color: ColorExpr{Ref: "fg", When: []ColorWhen{{Binding: "electronics.absActive", Ref: "warning"}}}},
	}
}

func init() { Register(absWidget{}) }
