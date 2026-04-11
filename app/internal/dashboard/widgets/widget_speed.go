package widgets

const WidgetSpeed WidgetType = "speed"

type speedWidget struct{}

func (speedWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetSpeed, Label: "Speed", Category: CategoryCar,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 30,
	}
}

func (speedWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Binding: "car.speedMS", Format: "speed", Font: FontNumber, FontScale: 0.45,
			X: 0.5, Y: 0.4, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "fg"}},
		{Kind: ElemText, Text: "km/h", Font: FontLabel, FontScale: 0.18,
			X: 0.5, Y: 0.72, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
	}
}

func init() { Register(speedWidget{}) }
