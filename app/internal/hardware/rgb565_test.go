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

	wantCenter := map[[2]int]byte{
		{1, 1}: 0,
		{2, 1}: 2,
		{1, 2}: 8,
		{2, 2}: 10,
	}
	for pos, want := range wantCenter {
		x, y := pos[0], pos[1]
		got := dst[(y*4+x)*2]
		if got != want {
			t.Fatalf("expected pixel (%d,%d) = %d, got %d", x, y, want, got)
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
