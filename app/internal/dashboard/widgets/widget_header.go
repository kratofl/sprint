package widgets

const WidgetHeader WidgetType = "header"

type headerWidget struct{}

func (headerWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetHeader, Label: "Header", Category: CategoryLayout,
		DefaultColSpan: 20, DefaultRowSpan: 2,
		IdleCapable: true, DefaultUpdateHz: 5,
		Header: HeaderConfig{Disabled: true},
	}
}

func (headerWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Text: "SPRINT", Font: FontLabel, FontScale: 0.35,
			Zone: "fill", X: 0.03, HAlign: HAlignStart, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "session.track", Font: FontLabel, FontScale: 0.35,
			Zone: "fill", X: 0.18, HAlign: HAlignStart, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Binding: "session.car", Font: FontLabel, FontScale: 0.35,
			Zone: "fill", X: 0.45, HAlign: HAlignStart, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemText, Binding: "session.sessionType", Font: FontLabel, FontScale: 0.35,
			Zone: "fill", X: 0.65, HAlign: HAlignStart, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemText, Binding: "lap.currentLap", Format: "L%d", Font: FontMono, FontScale: 0.30,
			Zone: "fill", X: 0.87, HAlign: HAlignStart, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemDot, DotX: 0.95, DotY: 0.5, DotR: 0.08,
			Color: ColorExpr{Ref: "accent"}},
		{Kind: ElemText, Text: "LIVE", Font: FontLabel, FontScale: 0.25,
			Zone: "fill", HAlign: HAlignEnd, Color: ColorExpr{Ref: "accent"}},
	}
}

func init() { Register(headerWidget{}) }
