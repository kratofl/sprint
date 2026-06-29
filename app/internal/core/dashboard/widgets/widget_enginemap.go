package widgets

const WidgetEngineMap WidgetType = "engine_map"

type engineMapWidget struct{}

func (engineMapWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetEngineMap, Name: "Engine Map", Category: CategoryCarSettings,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label:             LabelConfig{FontScale: 0.14, Align: HAlignCenter},
		Panel:             PanelConfig{NoBorder: true},
		CapabilityBinding: BindingElectronicsMotorMapAvailable,
	}
}

func (engineMapWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Badge{Color: ColorRefMotor.Expr(), Radius: 0.74, Fill: 0.1},
		Text{Binding: BindingElectronicsMotorMap, Format: FormatInt, X: 0.5, Y: 0.52, Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.36, IsBold: true, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: ColorRefMotor.Expr()}},
	}
}

func init() { Register(engineMapWidget{}) }
