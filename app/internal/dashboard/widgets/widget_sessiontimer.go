package widgets

const WidgetSessionTimer WidgetType = "session_timer"

type sessionTimerWidget struct{}

func (sessionTimerWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetSessionTimer, Name: "Session Timer", Category: CategoryTiming,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz5,
		Label: LabelConfig{Text: "SESSION", FontScale: 0.18, Align: HAlignCenter},
	}
}

func (sessionTimerWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: BindingSessionTime, Format: "session", Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.45, IsBold: true, HAlign: HAlignCenter, Color: ColorRefForeground.Expr()}},
	}
}

func init() { Register(sessionTimerWidget{}) }
