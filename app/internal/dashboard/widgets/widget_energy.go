package widgets

import "fmt"

const WidgetEnergy WidgetType = "virtual_energy"

func init() {
	RegisterWidget(WidgetEnergy, "Virtual Energy", CategoryRace, 4, 3, false, nil, drawWidgetEnergy)
}

func drawWidgetEnergy(c WidgetCtx) {
	c.Panel()

	soc := float64(c.Frame.Energy.SoC)
	regen := float64(c.Frame.Energy.RegenPower)

	col := ColSuccess
	switch {
	case soc < 0.2:
		col = ColDanger
	case soc < 0.4:
		col = ColWarning
	}

	c.FontLabel(c.H * 0.14)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("ENERGY", c.CX(), c.Y+c.H*0.16, 0.5, 0.5)

	c.FontNumber(c.H * 0.42)
	c.DC.SetColor(col)
	c.DC.DrawStringAnchored(fmt.Sprintf("%.1f%%", soc*100), c.CX(), c.CY(), 0.5, 0.5)

	barX := c.X + c.W*0.1
	barW := c.W * 0.8
	barH := c.H * 0.08
	barY := c.Y + c.H*0.82

	const maxRegen = 200.0
	regenPct := regen / maxRegen
	c.HBar(barX, barY, barW, barH, regenPct, ColTeal)

	c.FontLabel(c.H * 0.12)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("REGEN", c.CX(), barY+barH+c.H*0.05, 0.5, 0)
}
