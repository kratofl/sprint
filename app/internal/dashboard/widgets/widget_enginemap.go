package widgets

const WidgetEngineMap WidgetType = "engine_map"

type engineMapWidget struct{}

func (engineMapWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetEngineMap, Label: "Engine Map", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 15,
	}
}

func (engineMapWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemText, Text: "ENGINE MAP", Font: FontLabel, FontScale: 0.18,
			X: 0.5, Y: 0.22, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: "electronics.motorMap", Format: "MAP %d", Font: FontNumber, FontScale: 0.45,
			X: 0.5, Y: 0.6, AnchorX: 0.5, AnchorY: 0.5, Color: ColorExpr{Ref: "primary"}},
	}
}

func init() { Register(engineMapWidget{}) }
