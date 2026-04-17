package widgets

const WidgetHeader WidgetType = "header"

type headerWidget struct{}

func (headerWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetHeader, Name: "Header", Category: CategoryLayout,
		DefaultColSpan: 20, DefaultRowSpan: 2,
		IdleCapable: true, DefaultUpdateHz: Hz5,
		Label: LabelConfig{Disabled: true},
	}
}

func (headerWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Text: "SPRINT", Font: FontLabel, FontScale: 0.35,
			Zone: "fill", X: 0.03, HAlign: HAlignStart, Color: ColorRefMuted.Expr()},
		Text{Binding: "session.track", Font: FontLabel, FontScale: 0.35,
			Zone: "fill", X: 0.18, HAlign: HAlignStart, Color: ColorRefForeground.Expr()},
		Text{Binding: "session.car", Font: FontLabel, FontScale: 0.35,
			Zone: "fill", X: 0.45, HAlign: HAlignStart, Color: ColorRefSecondary.Expr()},
		Text{Binding: "session.sessionType", Font: FontLabel, FontScale: 0.35,
			Zone: "fill", X: 0.65, HAlign: HAlignStart, Color: ColorRefSecondary.Expr()},
		Text{Binding: "lap.currentLap", Format: "L%d", Font: FontMono, FontScale: 0.30,
			Zone: "fill", X: 0.87, HAlign: HAlignStart, Color: ColorRefMuted.Expr()},
		Dot{X: 0.95, Y: 0.5, R: 0.08,
			Color: ColorRefAccent.Expr()},
		Text{Text: "LIVE", Font: FontLabel, FontScale: 0.25,
			Zone: "fill", HAlign: HAlignEnd, Color: ColorRefAccent.Expr()},
	}
}

func init() { Register(headerWidget{}) }
