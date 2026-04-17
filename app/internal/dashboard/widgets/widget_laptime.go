package widgets

const WidgetLapTime WidgetType = "lap_time"

type lapTimeWidget struct{}

func (lapTimeWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetLapTime, Name: "Lap Time", Category: CategoryTiming,
		DefaultColSpan: 5, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{Text: "LAP TIMES", FontScale: 0.1},
	}
}

func (lapTimeWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Text: "Current", Font: FontLabel, FontScale: 0.12,
			Zone: "fill:0", HAlign: HAlignStart, Color: ColorRefSecondary.Expr()},
		Text{Binding: "lap.currentLapTime", Format: "lap", Font: FontNumber, FontScale: 0.16,
			Zone: "fill:0", HAlign: HAlignEnd, Color: ColorRefForeground.Expr()},
		Text{Text: "Last", Font: FontLabel, FontScale: 0.12,
			Zone: "fill:1", HAlign: HAlignStart, Color: ColorRefSecondary.Expr()},
		Text{Binding: "lap.lastLapTime", Format: "lap", Font: FontNumber, FontScale: 0.16,
			Zone: "fill:1", HAlign: HAlignEnd, Color: ColorRefForeground.Expr()},
		Text{Text: "Best", Font: FontLabel, FontScale: 0.12,
			Zone: "fill:2", HAlign: HAlignStart, Color: ColorRefSecondary.Expr()},
		Text{Binding: "lap.bestLapTime", Format: "lap", Font: FontNumber, FontScale: 0.16,
			Zone: "fill:2", HAlign: HAlignEnd, Color: ColorRefAccent.Expr()},
	}
}

func init() { Register(lapTimeWidget{}) }
