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
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
)

// ScreenConfig is the hardware-agnostic screen configuration shared by all drivers.
// Derived from devices.ScreenConfig in the coordinator.
type ScreenConfig struct {
	VID       uint16
	PID       uint16
	Width     int
	Height    int
	Rotation  int
	TargetFPS int    // 0 = use driver default
	OffsetX   int    // pixels from left in screen space (applied after rotation)
	OffsetY   int    // pixels from top in screen space (applied after rotation)
	Margin    int    // uniform inset in pixels on all sides
	Driver    string // DriverType: "vocore" or "usbd480"
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
	SetGlobalPrefs(prefs widgets.FormatPreferences)
	SetActivePage(index int)
	SetIdle(idle bool)
	OnFrame(frame *dto.TelemetryFrame)
	Run(ctx context.Context)
	SetDisabled(disabled bool)
	GetDisabled() bool
	// IsConnected reports whether the USB link to the screen is currently active.
	IsConnected() bool
	// SetEmit wires the Wails event emitter so the driver can notify the
	// frontend of connection state changes.
	SetEmit(fn func(string, ...any))
	// SetFrameSource replaces the rendering source for this driver.
	// For dash devices the coordinator may omit this call; baseDriver creates
	// a dashboard.Painter automatically on screen connect.
	// For rear_view devices the coordinator sets a capture.MirrorRenderer here.
	SetFrameSource(src FrameSource)
	// ClearExternalSource removes any non-Painter FrameSource (e.g. MirrorRenderer)
	// and sets the source to nil so the next ensureDashSource call creates a fresh
	// Painter. Used when a device switches from rear_view back to dash purpose.
	ClearExternalSource()
}
