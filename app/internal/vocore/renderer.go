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

// SetConfig updates the USB port settings. Safe to call before Run.
func (r *Renderer) SetConfig(cfg Config) {
	r.cfg = cfg
}
