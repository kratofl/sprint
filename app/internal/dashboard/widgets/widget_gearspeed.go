package widgets

const WidgetGearSpeed WidgetType = "gear_speed"

type gearSpeedWidget struct{}

func (gearSpeedWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGearSpeed, Label: "Gear + Speed", Category: CategoryCar,
		DefaultColSpan: 5, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 30,
		Header: HeaderConfig{Disabled: true},
	}
}

func (gearSpeedWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Binding: "car.gearStr", Font: FontNumber, FontScale: 0.68,
			Zone: "fill:0", HAlign: HAlignCenter, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Binding: "car.speedMS", Format: "speed", Font: FontNumber, FontScale: 0.19,
			Zone: "fill:1", HAlign: HAlignCenter, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Text: "km/h", Font: FontLabel, FontScale: 0.08,
			Zone: "footer", HAlign: HAlignCenter, Color: ColorExpr{Ref: "muted"}},
	}
}

func init() { Register(gearSpeedWidget{}) }
