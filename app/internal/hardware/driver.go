// Package hardware drives USB screens (VoCore M-PRO, USBD480) embedded in
// steering wheels or sim rigs. Frames are rendered by the dashboard package
// and forwarded to the screen over USB bulk transfer at ~30 fps.
//
// All hardware drivers implement the ScreenDriver interface. Use NewDriver to
// instantiate the correct driver for a given devices.DriverType.
package hardware

import (
	"context"

	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/pkg/dto"
)

// ScreenConfig is the hardware-agnostic screen configuration shared by all drivers.
// Derived from devices.ScreenConfig in the coordinator.
type ScreenConfig struct {
	VID      uint16
	PID      uint16
	Width    int
	Height   int
	Rotation int
}

// ScreenDriver is the interface the coordinator depends on for screen output.
// VoCoreDriver and USBD480Driver both implement this interface; the coordinator
// holds a ScreenDriver and does not need to know which concrete type it has.
type ScreenDriver interface {
	// Configure sets the target screen's USB identity and render dimensions.
	// Safe to call while the driver is running; takes effect on the next
	// connect attempt.
	Configure(cfg ScreenConfig)
	SetLayout(layout *dashboard.DashLayout)
	SetActivePage(index int)
	SetIdle(idle bool)
	OnFrame(frame *dto.TelemetryFrame)
	Run(ctx context.Context)
	SetPaused(paused bool)
	GetPaused() bool
	// IsConnected reports whether the USB link to the screen is currently active.
	IsConnected() bool
	// SetEmit wires the Wails event emitter so the driver can notify the
	// frontend of connection state changes.
	SetEmit(fn func(string, ...any))
}
