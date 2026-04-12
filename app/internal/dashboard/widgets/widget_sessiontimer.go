package widgets

const WidgetSessionTimer WidgetType = "session_timer"

type sessionTimerWidget struct{}

func (sessionTimerWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetSessionTimer, Label: "Session Timer", Category: CategoryTiming,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 5,
	}
}

func (sessionTimerWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "SESSION", Font: FontLabel, FontScale: 0.18,
			Zone: "header", HAlign: HAlignCenter, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "session.sessionTime", Format: "session", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter, Color: ColorExpr{Ref: "fg"}},
	}
}

func init() { Register(sessionTimerWidget{}) }
