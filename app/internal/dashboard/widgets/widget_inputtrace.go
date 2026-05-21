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
		binding  Binding
		centered bool
		color    ColorRef
	}
	rows := []row{
		{"THR", BindingCarThrottle, false, "success"},
		{"BRK", BindingCarBrake, false, "danger"},
		{"CLU", BindingCarClutch, false, "muted2"},
		{"STR", BindingCarSteeringNorm, true, "muted2"},
	}
	elems := []Element{}
	for i, r := range rows {
		cy := 0.125 + float64(i)*0.25
		elems = append(elems,
			Text{Text: r.label, Style: TextStyle{
				Font: FontFamilyUI, FontSize: 0.09, HAlign: HAlignEnd, VAlign: VAlignCenter,
				Color: ColorRefMuted.Expr()}},
			Bar{Binding: r.binding,
				X: barX, Y: cy - barH/2, W: barW, H: barH,
				Centered: r.centered, Color: r.color.Expr()},
		)
	}
	return elems
}

func init() { Register(inputTraceWidget{}) }
