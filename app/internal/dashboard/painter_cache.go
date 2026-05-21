package dashboard

import (
	"image"

	"github.com/fogleman/gg"
)

// widgetCache holds the per-widget sub-context and rendered pixels.
// Each widget renders into its own img (widget-local coordinates) and the
// result is blitted onto the main canvas. This avoids the 384 KB image.Alpha
// allocation that gg.Clip() would otherwise create per widget per frame.
type widgetCache struct {
	img      *image.RGBA
	ctx      *gg.Context // gg context backed by img; widget-local origin (0,0)
	x, y     int
	lastNano int64
}

// getOrCreateCache returns the widgetCache for id, allocating a new one if the
// entry is absent or its dimensions have changed. The sub-context (ctx) is
// backed by cache.img and uses widget-local coordinates with (0,0) at the top-left.
func (p *Painter) getOrCreateCache(id string, x, y, pw, ph int) *widgetCache {
	if p.widgetCaches == nil {
		p.widgetCaches = make(map[string]*widgetCache)
	}
	cache := p.widgetCaches[id]
	if cache == nil || cache.img == nil || cache.img.Bounds().Dx() != pw || cache.img.Bounds().Dy() != ph {
		img := image.NewRGBA(image.Rect(0, 0, pw, ph))
		cache = &widgetCache{
			img: img,
			ctx: gg.NewContextForRGBA(img),
			x:   x,
			y:   y,
		}
		p.widgetCaches[id] = cache
	} else {
		cache.x = x
		cache.y = y
	}
	return cache
}

// blitCache copies the cached widget pixels back onto the canvas.
func (p *Painter) blitCache(dc *gg.Context, cache *widgetCache) {
	if cache.img == nil {
		return
	}
	if dst, ok := dc.Image().(*image.RGBA); ok {
		blitSubImage(dst, cache.img, cache.x, cache.y)
	}
}

// blitSubImage copies src into dst at position (x, y).
func blitSubImage(dst, src *image.RGBA, x, y int) {
	w := src.Bounds().Dx()
	h := src.Bounds().Dy()
	for row := 0; row < h; row++ {
		dstOff := dst.PixOffset(x, y+row)
		srcOff := src.PixOffset(0, row)
		copy(dst.Pix[dstOff:dstOff+w*4], src.Pix[srcOff:srcOff+w*4])
	}
}
