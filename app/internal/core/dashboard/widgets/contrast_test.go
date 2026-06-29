package widgets

import (
	"image/color"
	"testing"
)

func TestContrastForeground(t *testing.T) {
	black := color.RGBA{R: 0, G: 0, B: 0, A: 255}
	white := color.RGBA{R: 255, G: 255, B: 255, A: 255}

	cases := []struct {
		name string
		bg   color.RGBA
		want color.RGBA
	}{
		{"white background → black foreground", white, black},
		{"black background → white foreground", black, white},
		{"bright yellow → black foreground", color.RGBA{R: 251, G: 191, B: 36, A: 255}, black},
		{"deep blue → white foreground", color.RGBA{R: 20, G: 40, B: 120, A: 255}, white},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ContrastForeground(tc.bg); got != tc.want {
				t.Fatalf("ContrastForeground(%v) = %v, want %v", tc.bg, got, tc.want)
			}
		})
	}
}
