package widgets

const WidgetText WidgetType = "text"

func init() {
	RegisterWidget(WidgetText, "Text", CategoryLayout, 4, 2, true, 5, []ConfigDef{
		{
			Key:     "content",
			Label:   "Text",
			Type:    "text",
			Default: "Sprint",
		},
	}, drawWidgetText)
}

func drawWidgetText(c WidgetCtx) {
	c.Panel()

	text := c.ConfigString("content", "Sprint")

	fontSize := c.H * 0.45
	if fontSize > c.W*0.12 {
		fontSize = c.W * 0.12
	}

	c.FontBold(fontSize)
	c.DC.SetColor(ColTextPri)
	c.DC.DrawStringAnchored(text, c.CX(), c.CY(), 0.5, 0.5)
}
