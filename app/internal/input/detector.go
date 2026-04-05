// Package input maps hardware button presses to application commands via a user-configurable binding.
package input

import (
	"context"
	"errors"
	"log/slog"
	"sync/atomic"
	"time"
)

// ErrCaptureTimeout is returned by CaptureNextButton when no button press is
// detected within the specified timeout.
var ErrCaptureTimeout = errors.New("input: no button pressed within timeout")

// ErrCaptureInProgress is returned by CaptureNextButton when another capture
// session is already active.
var ErrCaptureInProgress = errors.New("input: capture already in progress")

const capturePollInterval = 10 * time.Millisecond

// Detector listens to wheel button events and dispatches the bound command.
type Detector struct {
	logger    *slog.Logger
	capturing atomic.Bool
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

// CaptureNextButton waits for the first new button press on any connected
// gamepad/joystick device and returns its 1-indexed button number.
// It polls the OS gamepad API every capturePollInterval and detects transitions
// from unpressed to pressed relative to the baseline snapshot taken on entry.
// Returns ErrCaptureTimeout if no press occurs within timeout, or
// ErrCaptureInProgress if another capture is already running.
func (d *Detector) CaptureNextButton(ctx context.Context, timeout time.Duration) (int, error) {
	if !d.capturing.CompareAndSwap(false, true) {
		return 0, ErrCaptureInProgress
	}
	defer d.capturing.Store(false)

	baseline := readButtonMask()
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return 0, ctx.Err()
		case <-time.After(capturePollInterval):
		}

		current := readButtonMask()
		newPresses := current &^ baseline // bits that transitioned 0→1
		if newPresses != 0 {
			for bit := 0; bit < 32; bit++ {
				if newPresses&(1<<bit) != 0 {
					return bit + 1, nil
				}
			}
		}
	}
	return 0, ErrCaptureTimeout
}
