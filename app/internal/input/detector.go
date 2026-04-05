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

// axisEventCh receives virtual button numbers emitted by joystick_windows.go
// when a relative-axis encoder value changes. Buffered to absorb bursts.
var axisEventCh = make(chan int, 64)

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

// CaptureNextButton waits for the first new button press (or encoder axis
// change) on any connected HID device and returns its 1-indexed button number.
//
// Physical buttons return their HID usage number (1-64).
// Relative-axis encoders return a virtual number ≥ 65 (stable per axis
// direction for a given device firmware).
//
// Returns ErrCaptureTimeout if no input occurs within timeout, or
// ErrCaptureInProgress if another capture is already running.
func (d *Detector) CaptureNextButton(ctx context.Context, timeout time.Duration) (int, error) {
	if !d.capturing.CompareAndSwap(false, true) {
		return 0, ErrCaptureInProgress
	}
	defer d.capturing.Store(false)

	// Drain any stale axis events that arrived before this capture session.
	for {
		select {
		case <-axisEventCh:
		default:
			goto drained
		}
	}
drained:

	baseline := readInputMask()
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		remaining := time.Until(deadline)
		wait := capturePollInterval
		if remaining < wait {
			wait = remaining
		}

		select {
		case <-ctx.Done():
			return 0, ctx.Err()
		case virtualBtn := <-axisEventCh:
			return virtualBtn, nil
		case <-time.After(wait):
		}

		current := readInputMask()
		newPresses := current &^ baseline
		if newPresses != 0 {
			for bit := 0; bit < 64; bit++ {
				if newPresses&(1<<bit) != 0 {
					return bit + 1, nil
				}
			}
		}
	}
	return 0, ErrCaptureTimeout
}
