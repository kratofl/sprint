package widgets

const WidgetInputTrace WidgetType = "input_trace"

type inputTraceWidget struct{}

func (inputTraceWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetInputTrace, Name: "Inputs", Category: CategoryCar,
		DefaultColSpan: 6, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: Hz30,
		Label: LabelConfig{FontScale: 0.08},
	}
}

func (inputTraceWidget) Definition(_ map[string]any) []Element {
	const barX, barW, barH = 0.22, 0.76, 0.12
	type row struct {
		label    string
		binding  string
		centered bool
		color    ColorRef
	}
	rows := []row{
		{"THR", "car.throttle", false, "success"},
		{"BRK", "car.brake", false, "danger"},
		{"CLU", "car.clutch", false, "muted2"},
		{"STR", "car.steeringNorm", true, "muted2"},
	}
	elems := []Element{}
	for i, r := range rows {
		cy := 0.125 + float64(i)*0.25
		elems = append(elems,
			Element{Kind: ElemText, Text: r.label, Font: FontLabel, FontScale: 0.09,
				X: 0.2, Y: cy, HAlign: HAlignEnd, VAlign: VAlignCenter, Color: ColorRefMuted.Expr()},
			Element{Kind: ElemHBar, BarBinding: r.binding,
				BarX: barX, BarY: cy - barH/2, BarW: barW, BarH: barH,
				BarCentered: r.centered, BarColor: r.color.Expr()},
		)
	}
	return elems
}

func init() { Register(inputTraceWidget{}) }
