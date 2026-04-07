//go:build !windows

package capture

import (
	"image"
	"log/slog"

	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/pkg/dto"
)

// MirrorRenderer is a no-op stub on non-Windows platforms.
// Windows GDI screen capture is not available here.
type MirrorRenderer struct {
	targetW, targetH int
}

// NewMirrorRenderer returns a no-op MirrorRenderer on non-Windows builds.
func NewMirrorRenderer(targetW, targetH int, _ devices.RearViewConfig, _ *slog.Logger) *MirrorRenderer {
	return &MirrorRenderer{targetW: targetW, targetH: targetH}
}

// SetConfig is a no-op on non-Windows builds.
func (r *MirrorRenderer) SetConfig(_ devices.RearViewConfig) {}

// ResizeTarget updates the canvas dimensions on non-Windows builds.
func (r *MirrorRenderer) ResizeTarget(w, h int) {
	r.targetW = w
	r.targetH = h
}

// Paint returns a black frame on non-Windows builds.
func (r *MirrorRenderer) Paint(_ *dto.TelemetryFrame) (image.Image, error) {
	return image.NewRGBA(image.Rect(0, 0, r.targetW, r.targetH)), nil
}

// SetIdle is a no-op on non-Windows builds.
func (r *MirrorRenderer) SetIdle(_ bool) {}

// Dims returns the target dimensions.
func (r *MirrorRenderer) Dims() (int, int) { return r.targetW, r.targetH }

// Close is a no-op on non-Windows builds.
func (r *MirrorRenderer) Close() {}
