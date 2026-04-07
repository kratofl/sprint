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

// ResizableSource is an optional extension of FrameSource for sources whose
// canvas can be resized at runtime. driveLoop uses this to correct the canvas
// dimensions after the hardware-detected native size is known.
type ResizableSource interface {
	FrameSource
	ResizeTarget(w, h int)
}
