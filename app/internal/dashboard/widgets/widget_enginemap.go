package widgets

import "fmt"

const WidgetEngineMap WidgetType = "engine_map"

func init() { RegisterWidget(WidgetEngineMap, "Engine Map", CategoryCar, 3, 2, false, 15, nil, drawWidgetEngineMap) }

func drawWidgetEngineMap(c WidgetCtx) {
	c.Panel()
	c.FontLabel(c.H * 0.18)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("ENGINE MAP", c.CX(), c.Y+c.H*0.22, 0.5, 0.5)

	e := c.Frame.Electronics
	var valStr string
	if e.MotorMapMax == 0 {
		valStr = fmt.Sprintf("%d", e.MotorMap)
	} else {
		valStr = fmt.Sprintf("MAP %d", e.MotorMap)
	}

	c.FontNumber(c.H * 0.45)
	c.DC.SetColor(ColAccent)
	c.DC.DrawStringAnchored(valStr, c.CX(), c.CY()+c.H*0.1, 0.5, 0.5)
}
