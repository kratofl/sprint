package widgets

const WidgetRPMBar WidgetType = "rpm_bar"

func init() { RegisterWidget(WidgetRPMBar, "RPM Bar", "Car", drawWidgetRPMBar) }

func drawWidgetRPMBar(c WidgetCtx) {
	c.Panel()
	rpmPct := clamp01(float64(c.Frame.Car.RPM) / float64(c.Frame.Car.MaxRPM))
	segs := 20
	segH := (c.H - 12) / float64(segs)
	filled := int(float64(segs) * rpmPct)
	for i := 0; i < segs; i++ {
		sy := c.Y + 6 + (c.H - 12) - float64(i+1)*segH
		pct := float64(i) / float64(segs)
		col := ColTeal
		if pct > 0.92 {
			col = ColRPMRed
		} else if pct > 0.85 {
			col = ColRPMOrange
		}
		if i >= filled {
			col = DimColor(col, 0.15)
		}
		c.DC.SetColor(col)
		c.DC.DrawRoundedRectangle(c.X+5, sy+1, c.W-10, segH-2, 2)
		c.DC.Fill()
	}
}
