package widgets

const WidgetRPMBar WidgetType = "rpm_bar"

type rpmBarWidget struct{}

func (rpmBarWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetRPMBar, Label: "RPM Bar", Category: CategoryCar,
		DefaultColSpan: 2, DefaultRowSpan: 8,
		IdleCapable: false, DefaultUpdateHz: 30,
	}
}

func (rpmBarWidget) Definition(_ map[string]any) []Element {
	return []Element{
		{Kind: ElemPanel},
		{Kind: ElemSegBar, SegBinding: "car.rpmPct", Segments: 20,
			SegStops: []SegColorStop{
				{At: 0.0, Color: "accent"},
				{At: 0.85, Color: "warning"},
				{At: 0.92, Color: "rpmred"},
			}},
	}
}

func init() { Register(rpmBarWidget{}) }
