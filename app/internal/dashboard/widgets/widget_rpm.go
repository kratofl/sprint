package widgets

const WidgetRPM WidgetType = "rpm"

type rpmWidget struct{}

func (rpmWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetRPM, Name: "RPM", Category: CategoryCar,
		DefaultColSpan: 2, DefaultRowSpan: 1,
		IdleCapable: false, DefaultUpdateHz: Hz30,
		Label: LabelConfig{FontScale: 0.18, Align: HAlignCenter},
	}
}

func (rpmWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: "car.rpm", Format: "%.0f", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter,
			Color: ColorRefForeground.When(WhenActive("car.rpmRedlineWarning", ColorRefWarning))},
	}
}

func init() { Register(rpmWidget{}) }
