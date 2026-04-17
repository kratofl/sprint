package widgets

const WidgetText WidgetType = "text"

type textWidget struct{}

func (textWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetText, Name: "Text", Category: CategoryLayout,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: true, DefaultUpdateHz: Hz5,
		Label: LabelConfig{Disabled: true},
		ConfigDefs: []ConfigDef{
			{Key: "content", Label: "Static Text", Type: "text", Default: "Sprint"},
			{Key: "binding", Label: "Data Binding", Type: "text", Default: ""},
			{Key: "format", Label: "Format", Type: "text", Default: ""},
			{Key: "color", Label: "Text Color (semantic)", Type: "text", Default: ""},
			{Key: "font_scale", Label: "Font Scale", Type: "number", Default: "1"},
		},
	}
}

func (textWidget) Definition(config map[string]any) []Element {
	binding := configString(config, "binding", "")
	format := configString(config, "format", "")
	content := configString(config, "content", "Sprint")
	colorKey := configString(config, "color", "")
	fontScale := 0.45 * configFloat(config, "font_scale", 1.0)

	ref := ColorRef("fg")
	if colorKey != "" {
		ref = ColorRef(colorKey)
	}

	return []Element{
		Text{Text: content, Binding: binding, Format: format,
			Font: FontBold, FontScale: fontScale,
			Zone: "fill", HAlign: HAlignCenter,
			Color: ref.Expr()},
	}
}

func init() { Register(textWidget{}) }
