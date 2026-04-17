package widgets

const WidgetEngineMap WidgetType = "engine_map"

type engineMapWidget struct{}

func (engineMapWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetEngineMap, Name: "Engine Map", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label: LabelConfig{FontScale: 0.18, Align: HAlignCenter},
		CapabilityBinding: BindingElectronicsMotorMapAvailable,
	}
}

func (engineMapWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: BindingElectronicsMotorMap, Format: "MAP %d", Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.45, IsBold: true, HAlign: HAlignCenter, Color: ColorRefPrimary.Expr()}},
	}
}

func init() { Register(engineMapWidget{}) }
