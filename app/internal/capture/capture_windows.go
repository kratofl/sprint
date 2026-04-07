//go:build windows

package capture

import (
	"fmt"
	"image"
	"log/slog"
	"sync/atomic"
	"syscall"
	"unsafe"

	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/pkg/dto"
	"golang.org/x/image/draw"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procGetDC                  = user32.NewProc("GetDC")
	procReleaseDC              = user32.NewProc("ReleaseDC")
	procCreateCompatibleDC     = gdi32.NewProc("CreateCompatibleDC")
	procCreateCompatibleBitmap = gdi32.NewProc("CreateCompatibleBitmap")
	procSelectObject           = gdi32.NewProc("SelectObject")
	procBitBlt                 = gdi32.NewProc("BitBlt")
	procDeleteDC               = gdi32.NewProc("DeleteDC")
	procDeleteObject           = gdi32.NewProc("DeleteObject")
	procGetDIBits              = gdi32.NewProc("GetDIBits")
)

const (
	srccopy      = 0x00CC0020
	biRGB        = 0
	dibRGBColors = 0
)

type bitmapInfoHeader struct {
	Size          uint32
	Width         int32
	Height        int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
}

type bitmapInfo struct {
	Header bitmapInfoHeader
	Colors [1]uint32
}

// MirrorRenderer implements hardware.FrameSource by capturing a region of the
// primary monitor via GDI BitBlt and scaling it to the target screen dimensions.
// Windows only.
type MirrorRenderer struct {
	targetW, targetH int
	cfg              atomic.Value // stores devices.RearViewConfig
	idle             atomic.Bool
	logger           *slog.Logger
}

// NewMirrorRenderer creates a MirrorRenderer for a screen of targetW×targetH pixels.
func NewMirrorRenderer(targetW, targetH int, cfg devices.RearViewConfig, logger *slog.Logger) *MirrorRenderer {
	r := &MirrorRenderer{
		targetW: targetW,
		targetH: targetH,
		logger:  logger,
	}
	r.cfg.Store(cfg)
	return r
}

// SetConfig hot-reloads the capture region without restarting the renderer.
func (r *MirrorRenderer) SetConfig(cfg devices.RearViewConfig) {
	r.cfg.Store(cfg)
}

// Paint captures the configured screen region and scales it to the target dims.
// Implements hardware.FrameSource.
func (r *MirrorRenderer) Paint(_ *dto.TelemetryFrame) (image.Image, error) {
	cfg := r.cfg.Load().(devices.RearViewConfig)

	if cfg.CaptureW <= 0 || cfg.CaptureH <= 0 {
		// No region configured yet — return a black frame.
		return image.NewRGBA(image.Rect(0, 0, r.targetW, r.targetH)), nil
	}

	raw, err := captureRegion(cfg.CaptureX, cfg.CaptureY, cfg.CaptureW, cfg.CaptureH)
	if err != nil {
		r.logger.Warn("screen capture failed", "err", err)
		return image.NewRGBA(image.Rect(0, 0, r.targetW, r.targetH)), nil
	}

	if cfg.CaptureW == r.targetW && cfg.CaptureH == r.targetH {
		return raw, nil
	}

	out := image.NewRGBA(image.Rect(0, 0, r.targetW, r.targetH))
	draw.BiLinear.Scale(out, out.Bounds(), raw, raw.Bounds(), draw.Src, nil)
	return out, nil
}

// SetIdle implements hardware.FrameSource. MirrorRenderer ignores idle state.
func (r *MirrorRenderer) SetIdle(idle bool) {
	r.idle.Store(idle)
}

// Dims implements hardware.FrameSource.
func (r *MirrorRenderer) Dims() (int, int) {
	return r.targetW, r.targetH
}

// Close implements hardware.FrameSource. MirrorRenderer holds no OS resources
// between Paint calls so Close is a no-op.
func (r *MirrorRenderer) Close() {}

// captureRegion captures a rectangle of the primary monitor starting at (x,y)
// with dimensions w×h using GDI BitBlt and returns it as an RGBA image.
func captureRegion(x, y, w, h int) (*image.RGBA, error) {
	screenDC, _, _ := procGetDC.Call(0)
	if screenDC == 0 {
		return nil, fmt.Errorf("capture: GetDC(desktop) failed")
	}
	defer procReleaseDC.Call(0, screenDC)

	memDC, _, _ := procCreateCompatibleDC.Call(screenDC)
	if memDC == 0 {
		return nil, fmt.Errorf("capture: CreateCompatibleDC failed")
	}
	defer procDeleteDC.Call(memDC)

	bitmap, _, _ := procCreateCompatibleBitmap.Call(screenDC, uintptr(w), uintptr(h))
	if bitmap == 0 {
		return nil, fmt.Errorf("capture: CreateCompatibleBitmap failed")
	}
	defer procDeleteObject.Call(bitmap)

	old, _, _ := procSelectObject.Call(memDC, bitmap)
	defer procSelectObject.Call(memDC, old)

	ret, _, _ := procBitBlt.Call(
		memDC, 0, 0, uintptr(w), uintptr(h),
		screenDC, uintptr(x), uintptr(y),
		srccopy,
	)
	if ret == 0 {
		return nil, fmt.Errorf("capture: BitBlt failed")
	}

	bmi := bitmapInfo{
		Header: bitmapInfoHeader{
			Size:        uint32(unsafe.Sizeof(bitmapInfoHeader{})),
			Width:       int32(w),
			Height:      -int32(h), // negative = top-down scan order
			Planes:      1,
			BitCount:    32,
			Compression: biRGB,
		},
	}

	pixels := make([]byte, w*h*4)
	ret, _, _ = procGetDIBits.Call(
		screenDC,
		bitmap,
		0,
		uintptr(h),
		uintptr(unsafe.Pointer(&pixels[0])),
		uintptr(unsafe.Pointer(&bmi)),
		dibRGBColors,
	)
	if ret == 0 {
		return nil, fmt.Errorf("capture: GetDIBits failed")
	}

	// GDI returns pixels in BGRA order; convert to RGBA for image.RGBA.
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for i := 0; i < w*h; i++ {
		b := pixels[i*4+0]
		g := pixels[i*4+1]
		r := pixels[i*4+2]
		a := pixels[i*4+3]
		if a == 0 {
			a = 0xff // GDI screen DCs have no alpha; treat as opaque
		}
		img.Pix[i*4+0] = r
		img.Pix[i*4+1] = g
		img.Pix[i*4+2] = b
		img.Pix[i*4+3] = a
	}
	return img, nil
}
