package widgets

const WidgetHeader WidgetType = "header"

type headerWidget struct{}

func (headerWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetHeader, Label: "Header", Category: CategoryLayout,
		DefaultColSpan: 20, DefaultRowSpan: 2,
		IdleCapable: true, DefaultUpdateHz: 5,
	}
}

func (headerWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "SPRINT", Font: FontLabel, FontScale: 0.35,
			X: 0.03, Y: 0.5, AnchorX: 0, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "session.track", Font: FontLabel, FontScale: 0.35,
			X: 0.18, Y: 0.5, AnchorX: 0, AnchorY: 0.5, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Binding: "session.car", Font: FontLabel, FontScale: 0.35,
			X: 0.45, Y: 0.5, AnchorX: 0, AnchorY: 0.5, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemText, Binding: "session.sessionType", Font: FontLabel, FontScale: 0.35,
			X: 0.65, Y: 0.5, AnchorX: 0, AnchorY: 0.5, Color: ColorExpr{Ref: "muted2"}},
		{Kind: ElemText, Binding: "lap.currentLap", Format: "L%d", Font: FontMono, FontScale: 0.30,
			X: 0.87, Y: 0.5, AnchorX: 0, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemDot, DotX: 0.95, DotY: 0.5, DotR: 0.08,
			Color: ColorExpr{Ref: "accent"}},
		{Kind: ElemText, Text: "LIVE", Font: FontLabel, FontScale: 0.25,
			X: 0.975, Y: 0.5, AnchorX: 1, AnchorY: 0.5, Color: ColorExpr{Ref: "accent"}},
	}
}

func init() { Register(headerWidget{}) }
