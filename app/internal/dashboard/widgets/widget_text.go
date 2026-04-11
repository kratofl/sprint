package widgets

const WidgetText WidgetType = "text"

type textWidget struct{}

func (textWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetText, Label: "Text", Category: CategoryLayout,
		DefaultColSpan: 4, DefaultRowSpan: 2,
		IdleCapable: true, DefaultUpdateHz: 5,
		ConfigDefs: []ConfigDef{
			{
				Key:     "content",
				Label:   "Static Text",
				Type:    "text",
				Default: "Sprint",
			},
			{
				Key:     "binding",
				Label:   "Data Binding",
				Type:    "text",
				Default: "",
			},
			{
				Key:     "format",
				Label:   "Format",
				Type:    "text",
				Default: "",
			},
			{
				Key:     "color",
				Label:   "Text Color",
				Type:    "text",
				Default: "",
			},
			{
				Key:     "font_scale",
				Label:   "Font Scale",
				Type:    "number",
				Default: "1",
			},
		},
	}
}

func (textWidget) Draw(c WidgetCtx) {
	c.Panel()

	var text string
	if binding := c.ConfigString("binding", ""); binding != "" {
		if val, ok := Resolve(c.Frame, binding); ok {
			text = FormatValue(val, c.ConfigString("format", ""))
		}
	}
	if text == "" {
		text = c.ConfigString("content", "Sprint")
	}

	fontScale := c.ConfigFloat("font_scale", 1.0)
	fontSize := c.H * 0.45 * fontScale
	if maxSize := c.W * 0.12 * fontScale; fontSize > maxSize {
		fontSize = maxSize
	}

	col := c.ConfigColor("color", ColTextPri)
	c.FontBold(fontSize)
	c.DC.SetColor(col)
	c.DC.DrawStringAnchored(text, c.CX(), c.CY(), 0.5, 0.5)
}

func init() { Register(textWidget{}) }
