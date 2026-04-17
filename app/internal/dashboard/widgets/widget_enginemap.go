package widgets

const WidgetEngineMap WidgetType = "engine_map"

type engineMapWidget struct{}

func (engineMapWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetEngineMap, Label: "Engine Map", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 15,
		Header: HeaderConfig{FontScale: 0.18, Align: HAlignCenter},
		CapabilityBinding: "electronics.motorMapAvailable",
	}
}

func (engineMapWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemText, Binding: "electronics.motorMap", Format: "MAP %d", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter, Color: ColorExpr{Ref: "primary"}},
	}
}

func init() { Register(engineMapWidget{}) }
