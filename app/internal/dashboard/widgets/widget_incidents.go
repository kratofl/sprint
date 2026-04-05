package widgets

import "fmt"

const WidgetIncidents WidgetType = "incidents"

func init() { RegisterWidget(WidgetIncidents, "Incidents", CategoryRace, 3, 2, false, 2, nil, drawWidgetIncidents) }

func drawWidgetIncidents(c WidgetCtx) {
	c.Panel()
	c.FontLabel(c.H * 0.18)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("INCIDENTS", c.CX(), c.Y+c.H*0.22, 0.5, 0.5)

	n := c.Frame.Penalties.Incidents
	col := ColSuccess
	switch {
	case n > 3:
		col = ColDanger
	case n > 0:
		col = ColWarning
	}

	c.FontNumber(c.H * 0.45)
	c.DC.SetColor(col)
	c.DC.DrawStringAnchored(fmt.Sprintf("%d", n), c.CX(), c.CY()+c.H*0.1, 0.5, 0.5)
}
