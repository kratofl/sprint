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

// ButtonEvent carries a button press together with the VID and PID of the
// HID device that fired it. VID and PID are zero on platforms where device
// identity is not available (non-Windows stubs).
type ButtonEvent struct {
	VID    uint16
	PID    uint16
	Button int
}

// inputEventCh receives button events from the Raw Input event loop.
// Physical button presses carry their HID usage number (1–65535).
// Relative-axis encoder ticks carry virtual numbers (axisVirtualBase+).
// Buffered to absorb bursts from multi-mode wheels.
var inputEventCh = make(chan ButtonEvent, 128)

// Detector listens to wheel button events and dispatches the bound command.
type Detector struct {
	logger    *slog.Logger
	capturing atomic.Bool

	bindMu  sync.RWMutex
	bindMap map[deviceKey]bindTarget
}

// deviceKey identifies a specific button on a specific HID device by VID+PID.
// VID/PID zero is a wildcard that matches any device.
type deviceKey struct {
	VID    uint16
	PID    uint16
	Button int
}

// bindTarget is the resolved command and optional screen ID for a binding.
// ScreenID is non-empty for per-device bindings (integrated wheel+screen);
// empty for global bindings that apply regardless of source device.
type bindTarget struct {
	Command  commands.Command
	ScreenID string
}

// NewDetector creates a Detector.
func NewDetector(logger *slog.Logger) *Detector {
	return &Detector{logger: logger, bindMap: map[deviceKey]bindTarget{}}
}

// SetBindings atomically replaces the complete button→command mapping.
// Safe to call from any goroutine at any time.
func (d *Detector) SetBindings(bindings []Binding) {
	m := make(map[deviceKey]bindTarget, len(bindings))
	for _, b := range bindings {
		if b.Button > 0 && b.Command != "" {
			key := deviceKey{VID: b.DeviceVID, PID: b.DevicePID, Button: b.Button}
			m[key] = bindTarget{Command: b.Command, ScreenID: b.ScreenID}
		}
	}
	d.bindMu.Lock()
	d.bindMap = m
	d.bindMu.Unlock()
	d.logger.Info("input bindings updated", "count", len(m))
}

// lookup returns the command target for the given button event.
// Tries exact VID/PID match first, then falls back to the VID=0/PID=0 wildcard.
func (d *Detector) lookup(evt ButtonEvent) (bindTarget, bool) {
	d.bindMu.RLock()
	defer d.bindMu.RUnlock()
	if t, ok := d.bindMap[deviceKey{VID: evt.VID, PID: evt.PID, Button: evt.Button}]; ok {
		return t, true
	}
	t, ok := d.bindMap[deviceKey{VID: 0, PID: 0, Button: evt.Button}]
	return t, ok
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
		case evt := <-inputEventCh:
			if d.capturing.Load() {
				// CaptureNextButton is consuming events — do not dispatch.
				continue
			}
			if target, ok := d.lookup(evt); ok {
				d.logger.Debug("dispatching command", "button", evt.Button, "vid", evt.VID, "pid", evt.PID, "command", target.Command, "screen", target.ScreenID)
				commands.Dispatch(target.Command, target.ScreenID)
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
	case evt := <-inputEventCh:
		return evt.Button, nil
	case <-timer.C:
		return 0, ErrCaptureTimeout
	}
}
