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

// inputEventCh receives button numbers from the Raw Input event loop.
// Physical button presses send their HID usage number (1–65535).
// Relative-axis encoder ticks send virtual numbers (axisVirtualBase+).
// Buffered to absorb bursts from multi-mode wheels.
var inputEventCh = make(chan int, 128)

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
	// TODO: subscribe to inputEventCh to dispatch bound commands (issue #14)
	<-ctx.Done()
	d.logger.Info("detector stopped")
}

// CaptureNextButton waits for the first physical button press or encoder tick
// on any connected HID device and returns its button number.
//
// Physical buttons return their HID usage number (1–65535, matching what
// SimHub reports — e.g. BUTTON_68 → 68).
// Relative-axis encoders return a virtual number ≥ axisVirtualBase.
//
// Returns ErrCaptureTimeout if no input occurs within timeout, or
// ErrCaptureInProgress if another capture is already running.
func (d *Detector) CaptureNextButton(ctx context.Context, timeout time.Duration) (int, error) {
	if !d.capturing.CompareAndSwap(false, true) {
		return 0, ErrCaptureInProgress
	}
	defer d.capturing.Store(false)

	// Drain any stale events queued before this capture session started.
	for {
		select {
		case <-inputEventCh:
		default:
			goto drained
		}
	}
drained:

	timer := time.NewTimer(timeout)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return 0, ctx.Err()
	case btn := <-inputEventCh:
		return btn, nil
	case <-timer.C:
		return 0, ErrCaptureTimeout
	}
}
