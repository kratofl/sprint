package hardware

import (
	"context"
	"log/slog"
)

// VoCoreDriver drives the VoCore M-PRO screen over WinUSB.
// It implements ScreenDriver by embedding baseDriver and opening a
// VoCore-specific USB transport in Run.
type VoCoreDriver struct {
	baseDriver
}

// NewVoCoreDriver creates a VoCoreDriver. The screen is not opened until Run is called.
func NewVoCoreDriver(logger *slog.Logger) *VoCoreDriver {
	return &VoCoreDriver{baseDriver: newBaseDriver(logger)}
}

// Run starts the render-and-send loop. Blocks until ctx is cancelled.
func (d *VoCoreDriver) Run(ctx context.Context) {
	d.runLoop(ctx, "vocore driver", func() (screenTransport, error) {
		return openVoCoreScreen(d.screen.VID, d.screen.PID, d.screen.Width, d.screen.Height, d.logger)
	})
}
