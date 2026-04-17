package widgets

const WidgetGearSpeed WidgetType = "gear_speed"

type gearSpeedWidget struct{}

func (gearSpeedWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGearSpeed, Name: "Gear + Speed", Category: CategoryCar,
		DefaultColSpan: 5, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz30,
		Label: LabelConfig{Disabled: true},
	}
}

func (gearSpeedWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: "car.gearStr", Font: FontNumber, FontScale: 0.68,
			Zone: "fill:0", HAlign: HAlignCenter, Color: ColorRefForeground.Expr()},
		Text{Binding: "car.speedMS", Format: "speed", Font: FontNumber, FontScale: 0.19,
			Zone: "fill:1", HAlign: HAlignCenter, Color: ColorRefForeground.Expr()},
		Text{Text: "km/h", Font: FontLabel, FontScale: 0.08,
			Zone: "footer", HAlign: HAlignCenter, Color: ColorRefMuted.Expr()},
	}
}

func init() { Register(gearSpeedWidget{}) }
