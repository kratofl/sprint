package widgets

import "fmt"

const WidgetTC WidgetType = "tc"

type tcWidget struct{}

func (tcWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetTC, Label: "Traction Control", Category: CategoryCar,
		DefaultColSpan: 3, DefaultRowSpan: 2,
		IdleCapable: false, DefaultUpdateHz: 15,
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
	}
}

func (tcWidget) Draw(c WidgetCtx) {
	c.Panel()

	mode := c.ConfigString("tcMode", "tc1")

	var val uint8
	var label string
	var active bool

	e := c.Frame.Electronics
	switch mode {
	case "tc2_cut":
		val, label = e.TCCut, "TC2"
	case "tc3_slip":
		val, label = e.TCSlip, "TC3"
	default:
		val, label, active = e.TC, "TC1", e.TCActive
	}

	c.FontLabel(c.H * 0.18)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored(label, c.CX(), c.Y+c.H*0.22, 0.5, 0.5)

	col := ColTextPri
	if active {
		col = ColTeal
	}

	c.FontNumber(c.H * 0.45)
	c.DC.SetColor(col)
	var valStr string
	valStr = fmt.Sprintf("%d", val)
	// if max == 0 {
	// 	valStr = fmt.Sprintf("%d", val)
	// } else {
	// 	valStr = fmt.Sprintf("%d / %d", val, max)
	// }
	c.DC.DrawStringAnchored(valStr, c.CX(), c.CY()+c.H*0.1, 0.5, 0.5)
}

func init() { Register(tcWidget{}) }
