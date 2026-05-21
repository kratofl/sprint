package widgets

const WidgetTC WidgetType = "tc"

type tcWidget struct{}

func (tcWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetTC, Name: "Traction Control", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: Hz15,
		Label:             LabelConfig{Hidden: true},
		CapabilityBinding: BindingElectronicsTCAvailable,
		ConfigDefs: []ConfigDef{{
			Key:   "tcMode",
			Label: "TC Mode",
			Type:  "select",
			Options: []Option{
				{Value: "tc1", Label: "TC1 (Main)"},
				{Value: "tc2_cut", Label: "TC2 (Cut)"},
				{Value: "tc3_slip", Label: "TC3 (Slip)"},
			},
			Default: "tc1",
		}},
		DefaultPanelRules: []ConditionalRule{
			{Property: BindingElectronicsTCActive, Op: RuleOpGT, Threshold: 0, Color: ColorRefTC, Alpha: 0.12},
		},
	}
}

func (tcWidget) Definition(config map[string]any) []Element {
	mode := configString(config, "tcMode", "tc1")
	var binding Binding
	var label string
	var activeBinding Binding
	switch mode {
	case "tc2_cut":
		binding, label = BindingElectronicsTCCut, "TC2"
	case "tc3_slip":
		binding, label = BindingElectronicsTCSlip, "TC3"
	default:
		binding, label, activeBinding = BindingElectronicsTC, "TC1", BindingElectronicsTCActive
	}
	col := ColorRefForeground.Expr()
	if activeBinding != "" {
		col = ColorRefForeground.When(WhenActive(activeBinding, ColorRefTC))
	}
	return []Element{
		Text{Text: label, X: 0.015, Y: 0.035, Style: TextStyle{
			Font: FontFamilyUI, FontSize: 0.13, HAlign: HAlignStart, VAlign: VAlignStart, Color: ColorRefMuted.Expr()}},
		Text{Binding: binding, Format: FormatInt, X: 0.5, Y: 0.56, Style: TextStyle{
			Font: FontFamilyMono, FontSize: 0.52, IsBold: true, HAlign: HAlignCenter, VAlign: VAlignCenter, Color: col}},
	}
}

func init() { Register(tcWidget{}) }
