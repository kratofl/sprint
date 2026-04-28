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

// applyScreenMargin scales the full RGB565 buffer into a centered inset region,
// leaving a black border of margin pixels on each side. It samples the covered
// source area rather than a single floor-mapped source pixel so one-pixel
// dashboard borders do not disappear at specific columns during downscaling.
func applyScreenMargin(src, dst []byte, nativeW, nativeH, margin int) {
	if margin <= 0 {
		copy(dst, src)
		return
	}

	innerW := nativeW - (margin * 2)
	innerH := nativeH - (margin * 2)
	for i := range dst {
		dst[i] = 0
	}
	if innerW <= 0 || innerH <= 0 {
		return
	}

	for dy := 0; dy < innerH; dy++ {
		dstRow := (dy + margin) * nativeW
		sy0 := dy * nativeH / innerH
		sy1 := ((dy+1)*nativeH + innerH - 1) / innerH
		if sy1 <= sy0 {
			sy1 = sy0 + 1
		}
		if sy1 > nativeH {
			sy1 = nativeH
		}
		for dx := 0; dx < innerW; dx++ {
			sx0 := dx * nativeW / innerW
			sx1 := ((dx+1)*nativeW + innerW - 1) / innerW
			if sx1 <= sx0 {
				sx1 = sx0 + 1
			}
			if sx1 > nativeW {
				sx1 = nativeW
			}
			srcIdx := visibleRGB565InArea(src, nativeW, sx0, sx1, sy0, sy1)
			dstIdx := (dstRow + dx + margin) * 2
			dst[dstIdx] = src[srcIdx]
			dst[dstIdx+1] = src[srcIdx+1]
		}
	}
}

func visibleRGB565InArea(src []byte, nativeW, sx0, sx1, sy0, sy1 int) int {
	bestIdx := (sy0*nativeW + sx0) * 2
	bestScore := rgb565Visibility(src[bestIdx], src[bestIdx+1])
	for sy := sy0; sy < sy1; sy++ {
		for sx := sx0; sx < sx1; sx++ {
			idx := (sy*nativeW + sx) * 2
			score := rgb565Visibility(src[idx], src[idx+1])
			if score > bestScore {
				bestIdx = idx
				bestScore = score
			}
		}
	}
	return bestIdx
}

func rgb565Visibility(lo, hi byte) int {
	px := uint16(lo) | uint16(hi)<<8
	r := int((px >> 11) & 0x1f)
	g := int((px >> 5) & 0x3f)
	b := int(px & 0x1f)
	return r*299 + (g*587)/2 + b*114
}

// applyScreenOffset shifts content in the RGB565 buffer so that offsetX pixels
// of black appear at the left screen edge and offsetY pixels at the top screen
// edge. The rotation parameter must match the rotation applied to produce buf so
// that offsets are expressed in screen (user-visible) coordinates rather than
// native buffer coordinates. In-place, no allocation.
//
// Rotation → native operation mapping:
//
//	  0°  left=fromLeft,  top=fromTop
//	 90°  left=fromTop,   top=fromRight
//	180°  left=fromRight, top=fromBottom
//	270°  left=fromBottom,top=fromLeft
func applyScreenOffset(buf []byte, nativeW, nativeH, offsetX, offsetY, rotation int) {
	if offsetX == 0 && offsetY == 0 {
		return
	}
	if offsetX < 0 {
		offsetX = 0
	}
	if offsetY < 0 {
		offsetY = 0
	}

	var fromLeft, fromRight, fromTop, fromBottom int
	switch sanitizeRotation(rotation) {
	case 90:
		fromTop = offsetX
		fromRight = offsetY
	case 180:
		fromRight = offsetX
		fromBottom = offsetY
	case 270:
		fromBottom = offsetX
		fromLeft = offsetY
	default: // 0
		fromLeft = offsetX
		fromTop = offsetY
	}

	rowBytes := nativeW * 2

	// fromTop: add black at top rows, shift content down.
	if fromTop > 0 {
		if fromTop >= nativeH {
			for i := range buf {
				buf[i] = 0
			}
			return
		}
		for row := nativeH - 1; row >= fromTop; row-- {
			copy(buf[row*rowBytes:(row+1)*rowBytes], buf[(row-fromTop)*rowBytes:(row-fromTop+1)*rowBytes])
		}
		for i := 0; i < fromTop*rowBytes; i++ {
			buf[i] = 0
		}
	}

	// fromBottom: add black at bottom rows, shift content up.
	if fromBottom > 0 {
		if fromBottom >= nativeH {
			for i := range buf {
				buf[i] = 0
			}
			return
		}
		for row := 0; row < nativeH-fromBottom; row++ {
			copy(buf[row*rowBytes:(row+1)*rowBytes], buf[(row+fromBottom)*rowBytes:(row+fromBottom+1)*rowBytes])
		}
		for i := (nativeH - fromBottom) * rowBytes; i < len(buf); i++ {
			buf[i] = 0
		}
	}

	// fromLeft: add black at left of each row, shift content right.
	if fromLeft > 0 {
		shiftBytes := fromLeft * 2
		if shiftBytes >= rowBytes {
			for i := range buf {
				buf[i] = 0
			}
			return
		}
		for row := 0; row < nativeH; row++ {
			start := row * rowBytes
			copy(buf[start+shiftBytes:start+rowBytes], buf[start:start+rowBytes-shiftBytes])
			for i := start; i < start+shiftBytes; i++ {
				buf[i] = 0
			}
		}
	}

	// fromRight: add black at right of each row, shift content left.
	if fromRight > 0 {
		shiftBytes := fromRight * 2
		if shiftBytes >= rowBytes {
			for i := range buf {
				buf[i] = 0
			}
			return
		}
		for row := 0; row < nativeH; row++ {
			start := row * rowBytes
			copy(buf[start:start+rowBytes-shiftBytes], buf[start+shiftBytes:start+rowBytes])
			for i := start + rowBytes - shiftBytes; i < start+rowBytes; i++ {
				buf[i] = 0
			}
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
