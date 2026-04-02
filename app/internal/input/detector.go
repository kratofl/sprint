// Package input maps hardware button presses to application commands via a user-configurable binding.
package input

import (
	"context"
	"log/slog"
)

// Detector listens to wheel button events and dispatches the bound command.
type Detector struct {
	logger *slog.Logger
}

// NewDetector creates a Detector.
func NewDetector(logger *slog.Logger) *Detector {
	return &Detector{logger: logger}
}

// Run starts the input button event loop.
func (d *Detector) Run(ctx context.Context) {
	d.logger.Info("detector running")
	// TODO: subscribe to wheel button event channel to trigger SetTargetLap
	<-ctx.Done()
	d.logger.Info("detector stopped")
}

