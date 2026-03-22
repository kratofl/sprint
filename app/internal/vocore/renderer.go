// Package vocore renders telemetry frames to PNG images and sends them to the
// VoCore screen embedded in the steering wheel over USB serial (CDC ACM).
//
// The VoCore device presents as a serial port when connected via USB:
//   - macOS:   /dev/cu.usbmodemXXXX
//   - Linux:   /dev/ttyACM0  or  /dev/ttyUSB0
//   - Windows: COM3  (or similar)
//
// Frames are sent as length-prefixed PNG data. The actual serial write is
// implemented with go.bug.st/serial once the VoCore-side receiver is finalised.
package vocore

import (
	"context"
	"log/slog"

	"github.com/kratofl/sprint/pkg/dto"
)

// Config holds the USB serial port settings for the VoCore screen.
type Config struct {
	Port     string // serial device path, e.g. "/dev/cu.usbmodem14201" or "COM3"
	BaudRate int    // serial baud rate; VoCore default is 115200
}

// DefaultConfig returns a sensible default configuration.
func DefaultConfig() Config {
	return Config{
		Port:     "/dev/cu.usbmodem14201",
		BaudRate: 115200,
	}
}

// Renderer encodes the current dash layout to PNG frames and sends them to the VoCore over USB.
type Renderer struct {
	cfg    Config
	logger *slog.Logger
}

// NewRenderer creates a Renderer with the default configuration.
func NewRenderer(logger *slog.Logger) *Renderer {
	return &Renderer{cfg: DefaultConfig(), logger: logger}
}

// Run starts the render loop. Blocks until ctx is cancelled.
func (r *Renderer) Run(ctx context.Context) {
	r.logger.Info("renderer starting", "port", r.cfg.Port, "baud_rate", r.cfg.BaudRate)
	<-ctx.Done()
	r.logger.Info("renderer stopped")
}

// OnFrame is called by the coordinator's telemetry loop on every new frame.
// The renderer is a stub until the VoCore PNG pipeline is implemented.
func (r *Renderer) OnFrame(_ *dto.TelemetryFrame) {
	// TODO: encode frame to PNG and write to VoCore over USB serial
}
