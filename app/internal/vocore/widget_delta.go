package vocore

import (
	"fmt"
	"math"

	"github.com/kratofl/sprint/app/internal/dash"
)

func init() { registerWidget(dash.WidgetDelta, drawWidgetDelta) }

func drawWidgetDelta(c WidgetCtx) {
	c.Panel()
	if c.Frame.Lap.TargetLapTime <= 0 {
		c.FontLabel(c.H * 0.15)
		c.DC.SetColor(colTextMuted)
		c.DC.DrawStringAnchored("No target", c.CX(), c.CY(), 0.5, 0.5)
		return
	}
	delta := c.Frame.Lap.CurrentLapTime - c.Frame.Lap.TargetLapTime
	dbh := c.H * 0.3
	dby := c.Y + c.H*0.4
	dbw := c.W - 24
	c.DC.SetColor(colSurface)
	c.DC.DrawRoundedRectangle(c.X+12, dby, dbw, dbh, 3)
	c.DC.Fill()

	maxD := 2.0
	pct := math.Max(-1, math.Min(1, delta/maxD))
	mid := c.X + 12 + dbw/2
	fw := math.Abs(pct) * dbw / 2
	if delta > 0 {
		c.DC.SetColor(colDanger)
		c.DC.DrawRoundedRectangle(mid, dby+1, fw, dbh-2, 2)
	} else {
		c.DC.SetColor(colTeal)
		c.DC.DrawRoundedRectangle(mid-fw, dby+1, fw, dbh-2, 2)
	}
	c.DC.Fill()

	sign, col := "+", colDanger
	if delta < 0 {
		sign, col = "-", colTeal
	}
	c.FontNumber(c.H * 0.18)
	c.DC.SetColor(col)
	c.DC.DrawStringAnchored(fmt.Sprintf("%s%.3f", sign, math.Abs(delta)),
		c.CX(), dby+dbh+c.H*0.15, 0.5, 0.5)
}
