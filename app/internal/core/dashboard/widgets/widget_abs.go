package widgets

const WidgetABS WidgetType = "abs"

type absWidget struct{}

func (absWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetABS, Name: "ABS", Category: CategoryCarSettings,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label:             LabelConfig{FontScale: 0.14},
		Panel:             PanelConfig{NoBorder: true},
		CapabilityBinding: BindingElectronicsABSAvailable,
		DefaultPanelRules: []ConditionalRule{
			{Property: BindingElectronicsABSActive, Op: RuleOpGT, Threshold: 0, Color: ColorRefABS, Alpha: 0.15},
		},
	}
}

func (absWidget) Definition(_ map[string]any) []Element {
	return []Element{
		Badge{Color: ColorRefABS.Expr(), Radius: 0.74, Fill: 0.1},
		Text{Binding: BindingElectronicsABS, Format: FormatInt, X: 0.5, Y: 0.52, Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.36, IsBold: true, HAlign: HAlignCenter, VAlign: VAlignCenter,
			Color: ColorRefForeground.When(WhenActive(BindingElectronicsABSActive, ColorRefABS))}},
	}
}

func init() { Register(absWidget{}) }
