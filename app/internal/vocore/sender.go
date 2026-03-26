package vocore

import (
	"errors"
	"fmt"
	"image"
	"log/slog"
)

// frameSender sends rendered frames to the VoCore screen over USB.
type frameSender interface {
	send(rgb565 []byte) error
	close()
	// nativeSize returns the screen's actual native pixel dimensions as
	// reported by the device. These may differ from the configured
	// ScreenConfig (e.g. 480×800 portrait vs 800×480 landscape).
	nativeSize() (width, height int)
}

// VoCore M-PRO screen USB protocol constants (from mpro_drm driver).
// Shared by all platform-specific sender implementations.
const (
	usbBulkEndpoint = 0x02 // bulk OUT endpoint for pixel data
	usbVendorReq    = 0xB0 // vendor-specific control request
	usbReqTypeOut   = 0x40 // USB_DIR_OUT | USB_TYPE_VENDOR | USB_RECIP_DEVICE

	// maxScreenPixels is a sanity cap to prevent integer overflow in
	// width*height*2. 4096×4096 = 16 M pixels × 2 = 32 MB, well above
	// any real VoCore screen (800×480 = 768 KB).
	maxScreenPixels = 4096 * 4096
)

// errScreenTransportUnsupported indicates that no platform transport is
// implemented for sending frames to the VoCore screen.
var errScreenTransportUnsupported = errors.New("vocore screen transport unsupported on this platform")

// validateScreenSize checks that width/height are positive and that
// width*height*2 (RGB565) does not overflow a reasonable buffer size.
func validateScreenSize(width, height int) (frameBytes int, err error) {
	if width <= 0 || height <= 0 {
		return 0, fmt.Errorf("invalid screen dimensions: %dx%d", width, height)
	}
	pixels := width * height
	if pixels > maxScreenPixels || pixels/width != height {
		return 0, fmt.Errorf("screen dimensions too large: %dx%d (%d pixels)", width, height, pixels)
	}
	return pixels * 2, nil
}

// openScreen opens a USB connection to the VoCore screen by VID/PID.
// Platform-specific implementations:
//   - sender_windows.go — native WinUSB API (no CGO, no libusb)
//   - sender_usb.go     — gousb/libusb (Linux with CGO)
//   - sender_stub.go    — fallback for unsupported platforms
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

// imageToRGB565CW90 converts an image to RGB565 little-endian with a 90° CW
// rotation. Source image W×H becomes output H×W (H pixels per row, W rows).
// dst must be at least W*H*2 bytes.
//
// This is used when a landscape-rendered image (e.g. 800×480) needs to be sent
// to a portrait-native VoCore screen (e.g. 480×800). The physical mounting of
// the screen (90° CCW from portrait) undoes the rotation so the user sees a
// correct landscape image.
func imageToRGB565CW90(img image.Image, dst []byte) {
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()

	// Output dimensions: srcH wide × srcW tall (rotated).
	dstW := srcH

	if rgba, ok := img.(*image.RGBA); ok {
		i := 0
		// Iterate in destination scan order: srcW rows of srcH pixels.
		for dy := 0; dy < srcW; dy++ {
			for dx := 0; dx < srcH; dx++ {
				// 90° CW: dest(dx, dy) ← source(dy, srcH-1-dx)
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

	// Slow fallback.
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
	_ = dstW // used conceptually for stride; the loop handles it
}

// mproModelDimensions returns the native pixel dimensions for the given mpro
// screen model ID. The model ID is queried from the device via USB control
// transfers (see queryScreenModel). Values from the mpro_drm Linux driver.
func mproModelDimensions(model uint32) (width, height int) {
	switch model {
	case 0x00000005: // MPRO-5 (5")
		return 480, 854
	case 0x00001005: // MPRO-5H (5" OLED)
		return 720, 1280
	case 0x00000007: // MPRO-6IN8 (6.8" — native landscape)
		return 800, 480
	case 0x00000403: // MPRO-3IN4 (3.4" — square)
		return 800, 800
	case 0x0000000a: // MPRO-10 (10")
		return 1024, 600
	default:
		// Default/4"/4.3" models are all 480×800 portrait.
		return 480, 800
	}
}
