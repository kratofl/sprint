package vocore

import (
	"image"
	"log/slog"
)

// frameSender sends rendered frames to the VoCore screen over USB.
type frameSender interface {
	send(rgb565 []byte) error
	close()
}

// openScreen opens a USB connection to the VoCore screen by VID/PID.
// Platform-specific: implemented in sender_usb.go (windows/linux)
// and sender_stub.go (other platforms).
func openScreen(vid, pid uint16, width, height int, logger *slog.Logger) (frameSender, error) {
	return openScreenImpl(vid, pid, width, height, logger)
}

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
				r := uint16(rgba.Pix[j]) >> 3   // 8-bit → 5-bit
				g := uint16(rgba.Pix[j+1]) >> 2 // 8-bit → 6-bit
				b := uint16(rgba.Pix[j+2]) >> 3 // 8-bit → 5-bit
				px := (r << 11) | (g << 5) | b
				dst[i] = byte(px)
				dst[i+1] = byte(px >> 8)
				i += 2
			}
		}
		return
	}

	// Slow fallback for other image types.
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
