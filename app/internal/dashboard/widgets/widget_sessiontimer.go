package widgets

const WidgetSessionTimer WidgetType = "session_timer"

type sessionTimerWidget struct{}

func (sessionTimerWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetSessionTimer, Label: "Session Timer", Category: CategoryTiming,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 5,
		Header: HeaderConfig{Text: "SESSION", FontScale: 0.18, Align: HAlignCenter},
	}
}

func (sessionTimerWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Binding: "session.sessionTime", Format: "session", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter, Color: ColorExpr{Ref: "fg"}},
	}
}

func init() { Register(sessionTimerWidget{}) }
