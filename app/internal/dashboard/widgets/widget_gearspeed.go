package widgets

const WidgetGearSpeed WidgetType = "gear_speed"

type gearSpeedWidget struct{}

func (gearSpeedWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetGearSpeed, Label: "Gear + Speed", Category: CategoryCar,
		DefaultColSpan: 5, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 30,
	}
}

func (gearSpeedWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Binding: "car.gearStr", Font: FontNumber, FontScale: 0.68,
			X: 0.5, Y: 0.45, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Binding: "car.speedMS", Format: "speed", Font: FontNumber, FontScale: 0.19,
			X: 0.5, Y: 0.76, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Text: "km/h", Font: FontLabel, FontScale: 0.08,
			X: 0.5, Y: 0.88, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
	}
}

func init() { Register(gearSpeedWidget{}) }
