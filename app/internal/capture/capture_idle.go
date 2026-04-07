package capture

import (
	"image"
	"image/color"
	"time"

	"github.com/kratofl/sprint/app/internal/devices"
	"golang.org/x/image/draw"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// renderIdleFrame produces a frame for the idle state (no game running).
// Mode "clock" renders a pixelated HH:MM:SS centered in orange on a black
// background. Any other value (including "") returns a plain black frame.
func renderIdleFrame(targetW, targetH int, mode string) *image.RGBA {
	out := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	if mode != devices.RearViewIdleClock {
		return out
	}

	text := time.Now().Format("15:04:05")

	// basicfont.Face7x13: each glyph is 7 px wide, 13 px tall (ascent 11).
	const (
		charW  = 7
		charH  = 13
		ascent = 11
		scale  = 4 // 4× nearest-neighbor → 28×52 px per glyph; clear on any screen
	)

	textW := len(text) * charW
	textH := charH

	small := image.NewRGBA(image.Rect(0, 0, textW, textH))
	orange := color.RGBA{R: 0xFF, G: 0x90, B: 0x6C, A: 0xFF}
	d := font.Drawer{
		Dst:  small,
		Src:  image.NewUniform(orange),
		Face: basicfont.Face7x13,
		Dot:  fixed.P(0, ascent),
	}
	d.DrawString(text)

	bigW := textW * scale
	bigH := textH * scale
	x := (targetW - bigW) / 2
	y := (targetH - bigH) / 2
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}

	dstRect := image.Rect(x, y, x+bigW, y+bigH)
	draw.NearestNeighbor.Scale(out, dstRect, small, small.Bounds(), draw.Src, nil)
	return out
}
