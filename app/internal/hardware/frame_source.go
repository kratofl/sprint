package hardware

import (
	"image"

	"github.com/kratofl/sprint/pkg/dto"
)

// FrameSource produces screen images for a given telemetry frame.
// dashboard.Painter satisfies this interface structurally.
type FrameSource interface {
	Paint(frame *dto.TelemetryFrame) (image.Image, error)
	SetIdle(idle bool)
	Dims() (w, h int)
	Close()
}
