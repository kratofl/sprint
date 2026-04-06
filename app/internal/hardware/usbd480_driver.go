package hardware

import (
	"context"
	"log/slog"
)

// USBD480Driver drives the USBD480 USB display.
// It implements ScreenDriver by embedding baseDriver and opening a
// USBD480-specific USB transport in Run.
type USBD480Driver struct {
	baseDriver
}

// NewUSBD480Driver creates an USBD480Driver. The screen is not opened until Run is called.
func NewUSBD480Driver(logger *slog.Logger) *USBD480Driver {
	return &USBD480Driver{baseDriver: newBaseDriver(logger)}
}

// Run starts the render-and-send loop. Blocks until ctx is cancelled.
func (d *USBD480Driver) Run(ctx context.Context) {
	d.runLoop(ctx, "usbd480 driver", func() (screenTransport, error) {
		return openUSBD480Screen(d.screen.VID, d.screen.PID, d.screen.Width, d.screen.Height, d.logger)
	})
}
