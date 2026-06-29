package widgets

const WidgetRPM WidgetType = "rpm"

type rpmWidget struct{}

func (rpmWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetRPM, Name: "RPM", Category: CategoryDriving,
		DefaultColSpan: 2, DefaultRowSpan: 1,
		IdleCapable: false, DefaultUpdateHz: Hz30,
		Label: LabelConfig{FontScale: 0.16, Align: HAlignCenter},
		// Open instrument — the value + sweep bar carry it, no frame.
		Panel: PanelConfig{Disabled: true},
	}
}

func (rpmWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Text{Binding: BindingCarRPM, Format: "%.0f", X: 0.5, Y: 0.46, Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.44, IsBold: true, HAlign: HAlignCenter, VAlign: VAlignCenter,
			Color: ColorRefForeground.When(WhenActive(BindingCarRPMRedlineWarning, ColorRefWarning))}},
		Bar{Binding: BindingCarRPMPct, X: 0.06, Y: 0.76, W: 0.88, H: 0.14,
			Color:   ColorRefAccent.When(WhenActive(BindingCarRPMRedlineWarning, ColorRefWarning)),
			BgColor: ColorRefSurface},
	}
}

func init() { Register(rpmWidget{}) }
