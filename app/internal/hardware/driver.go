package hardware

import (
	"context"

	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/pkg/dto"
)

// ScreenDriver is the interface the coordinator depends on for screen output.
// VoCoreDriver implements this; future drivers (e.g., USBD480) will too.
type ScreenDriver interface {
	SetLayout(layout *dashboard.DashLayout)
	SetActivePage(index int)
	SetIdle(idle bool)
	OnFrame(frame *dto.TelemetryFrame)
	Run(ctx context.Context)
	SetPaused(paused bool)
	GetPaused() bool
}
