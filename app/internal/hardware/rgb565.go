package hardware

import "image"

// imageToRGB565 converts an image to RGB565 little-endian, writing into dst.
// dst must be at least width*height*2 bytes. Uses a fast path for *image.RGBA
// which is the output type of fogleman/gg.
func imageToRGB565(img image.Image, dst []byte) {
	bounds := img.Bounds()

	if rgba, ok := img.(*image.RGBA); ok {
		i := 0
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			off := (y - rgba.Rect.Min.Y) * rgba.Stride
			for x := bounds.Min.X; x < bounds.Max.X; x++ {
				j := off + (x-rgba.Rect.Min.X)*4
				r := uint16(rgba.Pix[j]) >> 3
				g := uint16(rgba.Pix[j+1]) >> 2
				b := uint16(rgba.Pix[j+2]) >> 3
				px := (r << 11) | (g << 5) | b
				dst[i] = byte(px)
				dst[i+1] = byte(px >> 8)
				i += 2
			}
		}
		return
	}

	i := 0
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, _ := img.At(x, y).RGBA()
			r5 := uint16(r >> 11)
			g6 := uint16(g >> 10)
			b5 := uint16(b >> 11)
			px := (r5 << 11) | (g6 << 5) | b5
			dst[i] = byte(px)
			dst[i+1] = byte(px >> 8)
			i += 2
		}
	}
}

// imageToRGB565CW90 converts an image to RGB565 little-endian with a 90° CW
// rotation. Source image W×H becomes output H×W.
// dst must be at least W*H*2 bytes.
func imageToRGB565CW90(img image.Image, dst []byte) {
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	if rgba, ok := img.(*image.RGBA); ok {
		i := 0
		for dy := 0; dy < srcW; dy++ {
			for dx := 0; dx < srcH; dx++ {
				sx := dy
				sy := srcH - 1 - dx
				j := (sy-rgba.Rect.Min.Y)*rgba.Stride + (sx-rgba.Rect.Min.X)*4
				r := uint16(rgba.Pix[j]) >> 3
				g := uint16(rgba.Pix[j+1]) >> 2
				b := uint16(rgba.Pix[j+2]) >> 3
				px := (r << 11) | (g << 5) | b
				dst[i] = byte(px)
				dst[i+1] = byte(px >> 8)
				i += 2
			}
		}
		return
	}

	i := 0
	for dy := 0; dy < srcW; dy++ {
		for dx := 0; dx < srcH; dx++ {
			sx := bounds.Min.X + dy
			sy := bounds.Min.Y + srcH - 1 - dx
			r, g, b, _ := img.At(sx, sy).RGBA()
			px := (uint16(r>>11) << 11) | (uint16(g>>10) << 5) | uint16(b>>11)
			dst[i] = byte(px)
			dst[i+1] = byte(px >> 8)
			i += 2
		}
	}
}

// imageToRGB565CW180 converts an image to RGB565 little-endian with a 180°
// rotation. Output dimensions match input (W×H).
// dst must be at least W*H*2 bytes.
func imageToRGB565CW180(img image.Image, dst []byte) {
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	if rgba, ok := img.(*image.RGBA); ok {
		i := 0
		for y := srcH - 1; y >= 0; y-- {
			for x := srcW - 1; x >= 0; x-- {
				sy := bounds.Min.Y + y
				sx := bounds.Min.X + x
				j := (sy-rgba.Rect.Min.Y)*rgba.Stride + (sx-rgba.Rect.Min.X)*4
				r := uint16(rgba.Pix[j]) >> 3
				g := uint16(rgba.Pix[j+1]) >> 2
				b := uint16(rgba.Pix[j+2]) >> 3
				px := (r << 11) | (g << 5) | b
				dst[i] = byte(px)
				dst[i+1] = byte(px >> 8)
				i += 2
			}
		}
		return
	}

	i := 0
	for y := srcH - 1; y >= 0; y-- {
		for x := srcW - 1; x >= 0; x-- {
			sx := bounds.Min.X + x
			sy := bounds.Min.Y + y
			r, g, b, _ := img.At(sx, sy).RGBA()
			px := (uint16(r>>11) << 11) | (uint16(g>>10) << 5) | uint16(b>>11)
			dst[i] = byte(px)
			dst[i+1] = byte(px >> 8)
			i += 2
		}
	}
}

// imageToRGB565CW270 converts an image to RGB565 little-endian with a 270° CW
// (90° CCW) rotation. Source image W×H becomes output H×W.
// dst must be at least W*H*2 bytes.
func imageToRGB565CW270(img image.Image, dst []byte) {
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	if rgba, ok := img.(*image.RGBA); ok {
		i := 0
		for dy := 0; dy < srcW; dy++ {
			for dx := 0; dx < srcH; dx++ {
				sx := bounds.Min.X + (srcW - 1 - dy)
				sy := bounds.Min.Y + dx
				j := (sy-rgba.Rect.Min.Y)*rgba.Stride + (sx-rgba.Rect.Min.X)*4
				r := uint16(rgba.Pix[j]) >> 3
				g := uint16(rgba.Pix[j+1]) >> 2
				b := uint16(rgba.Pix[j+2]) >> 3
				px := (r << 11) | (g << 5) | b
				dst[i] = byte(px)
				dst[i+1] = byte(px >> 8)
				i += 2
			}
		}
		return
	}

	i := 0
	for dy := 0; dy < srcW; dy++ {
		for dx := 0; dx < srcH; dx++ {
			sx := bounds.Min.X + (srcW - 1 - dy)
			sy := bounds.Min.Y + dx
			r, g, b, _ := img.At(sx, sy).RGBA()
			px := (uint16(r>>11) << 11) | (uint16(g>>10) << 5) | uint16(b>>11)
			dst[i] = byte(px)
			dst[i+1] = byte(px >> 8)
			i += 2
		}
	}
}
