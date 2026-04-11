package widgets

import "fmt"

const WidgetEnergy WidgetType = "virtual_energy"

type energyWidget struct{}

func (energyWidget) Meta() WidgetMeta {
	return WidgetMeta{
		Type: WidgetEnergy, Label: "Virtual Energy", Category: CategoryRace,
		DefaultColSpan: 4, DefaultRowSpan: 3,
		IdleCapable: false, DefaultUpdateHz: 15,
	}
}

func (energyWidget) Draw(c WidgetCtx) {
	c.Panel()

	virtualenergy := float64(c.Frame.Energy.VirtualEnergy) * 100

	col := ColSuccess

	c.FontLabel(c.H * 0.14)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("ENERGY", c.CX(), c.Y+c.H*0.16, 0.5, 0.5)

	c.FontNumber(c.H * 0.42)
	c.DC.SetColor(col)
	c.DC.DrawStringAnchored(fmt.Sprintf("%.1f%%", virtualenergy), c.CX(), c.CY(), 0.5, 0.5)

	barX := c.X + c.W*0.1
	barW := c.W * 0.8
	barH := c.H * 0.08
	barY := c.Y + c.H*0.82

	regenPct := virtualenergy
	c.HBar(barX, barY, barW, barH, regenPct, ColTeal)

	c.FontLabel(c.H * 0.12)
	c.DC.SetColor(ColTextMuted)
	c.DC.DrawStringAnchored("REGEN", c.CX(), barY+barH+c.H*0.05, 0.5, 0)
}

func init() { Register(energyWidget{}) }
