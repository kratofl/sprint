package widgets

const WidgetEngineMap WidgetType = "engine_map"

type engineMapWidget struct{}

func (engineMapWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetEngineMap, Name: "Engine Map", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{FontScale: 0.18, Align: HAlignCenter},
		CapabilityBinding: "electronics.motorMapAvailable",
	}
}

func (engineMapWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: "electronics.motorMap", Format: "MAP %d", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter, Color: ColorRefPrimary.Expr()},
	}
}

func init() { Register(engineMapWidget{}) }
