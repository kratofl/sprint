package widgets

const WidgetTC WidgetType = "tc"

type tcWidget struct{}

func (tcWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetTC, Label: "Traction Control", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 15,
		Header: HeaderConfig{Disabled: true},
		CapabilityBinding: "electronics.tcAvailable",
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
			{Property: "electronics.tcActive", Op: RuleOpGT, Threshold: 0, Color: ColorRefTC, Alpha: 0.12},
		},
	}
}

func (tcWidget) Definition(config map[string]any) []Element {
	mode := configString(config, "tcMode", "tc1")
	var binding, label, activeBinding string
	switch mode {
	case "tc2_cut":
		binding, label = "electronics.tcCut", "TC2"
	case "tc3_slip":
		binding, label = "electronics.tcSlip", "TC3"
	default:
		binding, label, activeBinding = "electronics.tc", "TC1", "electronics.tcActive"
	}
	col := ColorExpr{Ref: "fg"}
	if activeBinding != "" {
		col.When = []ColorWhen{{Binding: activeBinding, Ref: "accent"}}
	}
	return []Element{
		{Kind: ElemText, Text: label, Font: FontLabel, FontScale: 0.18,
			Zone: "header", HAlign: HAlignStart, Color: ColorExpr{Ref: "muted"}},
		{Kind: ElemText, Binding: binding, Format: "int", Font: FontNumber, FontScale: 0.45,
			Zone: "fill", HAlign: HAlignCenter, Color: ColorExpr{Ref: ColorRefTC}},
	}
}

func init() { Register(tcWidget{}) }
