// Package input maps hardware button presses to application commands via a user-configurable binding.
package input

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/kratofl/sprint/app/internal/commands"
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

	bindMu  sync.RWMutex
	bindMap map[int]commands.Command // button number → command
}

// NewDetector creates a Detector.
func NewDetector(logger *slog.Logger) *Detector {
	return &Detector{logger: logger, bindMap: map[int]commands.Command{}}
}

// SetBindings atomically replaces the complete button→command mapping.
// Safe to call from any goroutine at any time.
func (d *Detector) SetBindings(bindings []Binding) {
	m := make(map[int]commands.Command, len(bindings))
	for _, b := range bindings {
		if b.Button > 0 && b.Command != "" {
			m[b.Button] = b.Command
		}
	}
	d.bindMu.Lock()
	d.bindMap = m
	d.bindMu.Unlock()
	d.logger.Info("input bindings updated", "count", len(m))
}

// lookup returns the command bound to btn, or an empty string if none.
func (d *Detector) lookup(btn int) commands.Command {
	d.bindMu.RLock()
	cmd := d.bindMap[btn]
	d.bindMu.RUnlock()
	return cmd
}

// Run reads button events from the Raw Input loop and dispatches bound commands.
// Events are suppressed while a CaptureNextButton call is in progress.
func (d *Detector) Run(ctx context.Context) {
	d.logger.Info("detector running")
	for {
		select {
		case <-ctx.Done():
			d.logger.Info("detector stopped")
			return
		case btn := <-inputEventCh:
			if d.capturing.Load() {
				// CaptureNextButton is consuming events — do not dispatch.
				continue
			}
			if cmd := d.lookup(btn); cmd != "" {
				d.logger.Debug("dispatching command", "button", btn, "command", cmd)
				commands.Dispatch(cmd, nil)
			}
		}
	}
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
