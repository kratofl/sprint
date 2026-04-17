package dashboard

import (
	"image"
	"image/color"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
)

// ensureBg pre-renders the static background into bgImg once per painter
// lifetime. Subsequent frames blit this image instead of clearing manually.
func (p *Painter) ensureBg() {
	if p.bgImg != nil {
		return
	}
	tmp := gg.NewContext(p.width, p.height)
	tmp.SetColor(widgets.ColorBackground)
	tmp.Clear()
	src := tmp.Image().(*image.RGBA)
	p.bgImg = image.NewRGBA(src.Rect)
	copy(p.bgImg.Pix, src.Pix)
}

// getContext returns the reusable gg.Context reset to the pre-baked background.
// The same *image.RGBA is reused across frames: the caller converts it to
// RGB565 immediately after Paint returns, so reuse is safe.
func (p *Painter) getContext() *gg.Context {
	if p.ctx == nil {
		p.ctx = gg.NewContext(p.width, p.height)
	}
	if dst, ok := p.ctx.Image().(*image.RGBA); ok && p.bgImg != nil {
		copy(dst.Pix, p.bgImg.Pix)
	} else {
		p.ctx.SetColor(widgets.ColorBackground)
		p.ctx.Clear()
	}
	return p.ctx
}

// painterDrawPanel draws a bordered panel: border ring then background interior.
func painterDrawPanel(dc *gg.Context, x, y, w, h, r, bw float64) {
	dc.SetColor(widgets.ColorBorder)
	dc.DrawRoundedRectangle(x, y, w, h, r)
	dc.Fill()
	dc.SetColor(widgets.ColorBackground)
	dc.DrawRoundedRectangle(x+bw, y+bw, w-bw*2, h-bw*2, r)
	dc.Fill()
}

// painterDrawHBar draws a left-fill progress bar with a dim track.
func painterDrawHBar(dc *gg.Context, x, y, w, h, pct float64, col, bg color.RGBA) {
	pct = clamp01(pct)
	dc.SetColor(widgets.DimColor(col, 0.15))
	dc.DrawRoundedRectangle(x, y, w, h, 3)
	dc.Fill()
	if pct > 0 {
		dc.SetColor(col)
		dc.DrawRoundedRectangle(x, y, w*pct, h, 3)
		dc.Fill()
	}
	_ = bg
}

// painterDrawHBarCentered draws a horizontal bar where 0.5 is the centre.
// Values < 0.5 fill left of centre, values > 0.5 fill right of centre.
func painterDrawHBarCentered(dc *gg.Context, x, y, w, h, pct float64, col, bg color.RGBA) {
	pct = clamp01(pct)
	dc.SetColor(widgets.DimColor(col, 0.15))
	dc.DrawRoundedRectangle(x, y, w, h, 3)
	dc.Fill()
	dc.SetColor(widgets.DimColor(col, 0.4))
	dc.DrawRectangle(x+w/2-0.5, y, 1, h)
	dc.Fill()
	if pct != 0.5 {
		dc.SetColor(col)
		if pct < 0.5 {
			fillW := (0.5 - pct) * w
			dc.DrawRoundedRectangle(x+pct*w, y, fillW, h, 3)
		} else {
			fillW := (pct - 0.5) * w
			dc.DrawRoundedRectangle(x+w*0.5, y, fillW, h, 3)
		}
		dc.Fill()
	}
	_ = bg
}
