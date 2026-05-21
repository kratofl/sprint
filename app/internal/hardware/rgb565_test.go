package hardware

import "testing"

func TestApplyScreenMarginAddsUniformBorder(t *testing.T) {
	src := make([]byte, 4*4*2)
	for i := 0; i < 16; i++ {
		src[i*2] = byte(i)
		src[i*2+1] = byte(i)
	}
	dst := make([]byte, len(src))

	applyScreenMargin(src, dst, 4, 4, 1)

	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			got := dst[(y*4+x)*2]
			if x == 0 || x == 3 || y == 0 || y == 3 {
				if got != 0 {
					t.Fatalf("expected border pixel (%d,%d) to be black, got %d", x, y, got)
				}
			}
		}
	}

	for y := 1; y <= 2; y++ {
		for x := 1; x <= 2; x++ {
			got := dst[(y*4+x)*2]
			if got == 0 {
				t.Fatalf("expected inner pixel (%d,%d) to contain scaled content, got black", x, y)
			}
		}
	}
}

func TestApplyScreenMarginClearsWhenInsetConsumesFrame(t *testing.T) {
	src := make([]byte, 2*2*2)
	for i := range src {
		src[i] = 0xFF
	}
	dst := make([]byte, len(src))

	applyScreenMargin(src, dst, 2, 2, 1)

	for i, got := range dst {
		if got != 0 {
			t.Fatalf("expected dst[%d] to be 0, got %d", i, got)
		}
	}
}

func TestApplyScreenMarginPreservesThinVerticalLines(t *testing.T) {
	const (
		w      = 800
		h      = 480
		margin = 5
	)
	src := make([]byte, w*h*2)
	dst := make([]byte, len(src))
	lineLo, lineHi := rgb565(42, 42, 42)

	for _, x := range []int{79, 479} {
		for y := 0; y < h; y++ {
			idx := (y*w + x) * 2
			src[idx] = lineLo
			src[idx+1] = lineHi
		}
	}

	applyScreenMargin(src, dst, w, h, margin)

	for _, sourceX := range []int{79, 479} {
		x := margin + scaleSourceColumn(sourceX, w, w-margin*2)
		y := h / 2
		idx := (y*w + x) * 2
		if dst[idx] != lineLo || dst[idx+1] != lineHi {
			t.Fatalf("expected scaled vertical line from source x=%d at output x=%d, got bytes %02x %02x", sourceX, x, dst[idx], dst[idx+1])
		}
	}
}

func scaleSourceColumn(sourceX, sourceW, destW int) int {
	return ((sourceX * 2) + 1) * destW / (sourceW * 2)
}

func rgb565(r, g, b uint8) (byte, byte) {
	px := (uint16(r>>3) << 11) | (uint16(g>>2) << 5) | uint16(b>>3)
	return byte(px), byte(px >> 8)
}
