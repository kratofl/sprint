package widgets

const WidgetPosition WidgetType = "position"

type positionWidget struct{}

func (positionWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetPosition, Name: "Position", Category: CategoryRace,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz2,
		Label: LabelConfig{FontScale: 0.18, Align: HAlignCenter},
	}
}

func (positionWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: "race.positionStr", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter,
			Color: ColorRefForeground.When(WhenActive("race.positionP1", ColorRefPrimary))},
	}
}

func init() { Register(positionWidget{}) }
