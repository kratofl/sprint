// Package core wires all backend services together.
// It owns no business logic — it starts, stops, and connects the other packages.
package core

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/kratofl/sprint/app/internal/commands"
	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/app/internal/hardware"
	"github.com/kratofl/sprint/app/internal/input"
	springsync "github.com/kratofl/sprint/app/internal/sync"
	"github.com/kratofl/sprint/pkg/dto"
	"github.com/kratofl/sprint/pkg/games"
	"github.com/kratofl/sprint/pkg/games/lemansultimate"
)

// EmitFn is a function that emits a named event with arbitrary data to the
// Wails frontend. It matches the signature of runtime.EventsEmit.
type EmitFn func(event string, data ...any)

// Coordinator is the top-level wiring of all backend subsystems.
type Coordinator struct {
	logger  *slog.Logger
	adapter games.GameAdapter
	screen  hardware.ScreenDriver
	input   *input.Detector
	sync    *springsync.Client
	devMgr  *devices.Manager // for reloading device bindings on demand

	emit EmitFn // Wails runtime event emitter; no-op until SetEmit is called

	// Throttle: frontend receives at most one frame per frontendFrameInterval.
	lastFrontendEmit time.Time

	connected bool // true while the game adapter is live

	activePageIndex int
	currentLayout   *dashboard.DashLayout
	idleState       bool
}

const frontendFrameInterval = 33 * time.Millisecond // ~30 Hz

// New creates a Coordinator. logger is the root application logger;
// each subsystem receives a child logger tagged with its component name.
// dashMgr and devMgr are used to restore the saved layout and screen on startup.
func New(logger *slog.Logger, dashMgr *dashboard.Manager, devMgr *devices.Manager) *Coordinator {
	screen := hardware.NewVoCoreDriver(logger.With("component", "screen"))

	var initialLayout *dashboard.DashLayout

	// Load screen config and its assigned dash layout from the device registry.
	if devMgr != nil {
		if reg, err := devMgr.Load(); err == nil {
			if active := devices.ActiveScreen(reg); active != nil {
				screen.SetScreen(voCoreConfigFrom(devices.ToScreenConfig(active)))
				if dashMgr != nil {
					if layout, err := dashMgr.Load(active.DashID); err == nil && layout != nil {
						initialLayout = layout
						screen.SetLayout(layout)
					}
				}
			}
		}
	}

	// If no active screen, still load the default dash layout.
	if dashMgr != nil && devMgr == nil {
		if layout, err := dashMgr.Load(""); err == nil && layout != nil {
			initialLayout = layout
			screen.SetLayout(layout)
		}
	}

	c := &Coordinator{
		logger:        logger,
		adapter:       lemansultimate.New(),
		screen:        screen,
		input:         input.NewDetector(logger.With("component", "input")),
		sync:          springsync.NewClient(logger.With("component", "sync")),
		emit:          func(string, ...any) {}, // safe no-op before Wails startup
		devMgr:        devMgr,
		currentLayout: initialLayout,
		idleState:     true,
	}

	c.screen.SetIdle(true)

	commands.Handle(dashboard.CmdNextDashPage, func(_ any) { c.CyclePage(+1) })
	commands.Handle(dashboard.CmdPrevDashPage, func(_ any) { c.CyclePage(-1) })

	return c
}

// SetEmit provides the Wails runtime event emitter after the Wails context is
// available. Call this from App.Startup before Start.
func (c *Coordinator) SetEmit(fn EmitFn) {
	if fn != nil {
		c.emit = fn
		if vd, ok := c.screen.(*hardware.VoCoreDriver); ok {
			vd.SetEmit(fn)
		}
	}
}

// SetScreenConfig updates the active screen configuration and reconfigures the
// renderer. Safe to call after startup; the renderer will reconnect on the next
// tick if the VID/PID changed.
func (c *Coordinator) SetScreenConfig(cfg devices.ScreenConfig) {
	if vd, ok := c.screen.(*hardware.VoCoreDriver); ok {
		vd.SetScreen(voCoreConfigFrom(cfg))
	}
}

// voCoreConfigFrom converts a hardware-agnostic ScreenConfig to a VoCoreConfig.
func voCoreConfigFrom(cfg devices.ScreenConfig) hardware.VoCoreConfig {
	return hardware.VoCoreConfig{
		VID:        cfg.VID,
		PID:        cfg.PID,
		Width:      cfg.Width,
		Height:     cfg.Height,
		Rotation:   cfg.Rotation,
		DriverType: string(cfg.Driver),
	}
}

// GetScreenStatus returns "connected" if the VoCore USB link is active,
// "disconnected" otherwise. Used by the frontend on mount for initial state.
func (c *Coordinator) GetScreenStatus() string {
	if vd, ok := c.screen.(*hardware.VoCoreDriver); ok {
		if vd.IsScreenConnected() {
			return "connected"
		}
		return "disconnected"
	}
	return "unknown"
}

// SetScreenPaused pauses or resumes screen rendering. When paused, the USB
// handle is released so another application (e.g., SimHub) can drive the screen.
func (c *Coordinator) SetScreenPaused(paused bool) {
	c.screen.SetPaused(paused)
}

// GetScreenPaused reports whether screen rendering is currently paused.
func (c *Coordinator) GetScreenPaused() bool {
	return c.screen.GetPaused()
}

// SetDashLayout updates the layout used by the VoCore renderer. Resets the
// active page to 0. Takes effect on the next rendered frame.
func (c *Coordinator) SetDashLayout(layout *dashboard.DashLayout) {
	c.activePageIndex = 0
	c.currentLayout = layout
	c.screen.SetLayout(layout)
	c.screen.SetActivePage(0)
}

// CurrentLayoutID returns the ID of the layout currently loaded into the
// renderer, or an empty string if no layout is loaded.
func (c *Coordinator) CurrentLayoutID() string {
	if c.currentLayout == nil {
		return ""
	}
	return c.currentLayout.ID
}

// Wraps around. No-op if layout is nil or has no pages.
func (c *Coordinator) CyclePage(direction int) {
	if c.currentLayout == nil || len(c.currentLayout.Pages) == 0 {
		return
	}
	n := len(c.currentLayout.Pages)
	c.activePageIndex = ((c.activePageIndex+direction)%n + n) % n
	c.screen.SetActivePage(c.activePageIndex)
	c.emit("dash:page-changed", map[string]any{
		"pageIndex": c.activePageIndex,
		"pageName":  c.currentLayout.Pages[c.activePageIndex].Name,
	})
}

// updateIdleState detects session idle/active transitions and propagates them
// to the screen. Idle whenever the player does not have an active vehicle on
// track — covers game not running, garage, pre-session menu, and post-session.
func (c *Coordinator) updateIdleState(frame *dto.TelemetryFrame) {
	isIdle := !frame.Session.InCar
	if isIdle != c.idleState {
		c.idleState = isIdle
		c.screen.SetIdle(isIdle)
		c.emit("dash:idle-changed", map[string]any{"idle": isIdle})

		// When a session becomes active, snap back to the first page so the
		// driver sees live telemetry data immediately rather than the idle screen.
		if !isIdle {
			c.activePageIndex = 0
			c.screen.SetActivePage(0)
			c.emit("dash:page-changed", map[string]any{
				"pageIndex": 0,
				"pageName":  firstPageName(c.currentLayout),
			})
		}
	}
}

// ReloadInputBindings merges the global controls config with the active screen's
// device bindings and pushes the combined table to the input detector.
// Call after any save that changes either source.
func (c *Coordinator) ReloadInputBindings() {
	var merged []input.Binding

	// Global controls config (SetTargetLap, etc.)
	if cfg, err := input.LoadConfig(); err == nil {
		for _, b := range cfg.Bindings {
			merged = append(merged, b)
		}
	} else {
		c.logger.Warn("input: failed to load controls config", "err", err)
	}

	// Active screen device bindings (NextPage, PrevPage, etc.)
	if c.devMgr != nil {
		if reg, err := c.devMgr.Load(); err == nil {
			if active := devices.ActiveScreen(reg); active != nil {
				for _, db := range active.Bindings {
					if db.Button > 0 && db.Command != "" {
						merged = append(merged, input.Binding{
							Button:  db.Button,
							Command: commands.Command(db.Command),
						})
					}
				}
			}
		} else {
			c.logger.Warn("input: failed to load device registry for bindings", "err", err)
		}
	}

	c.input.SetBindings(merged)
}

// Start launches all subsystems. ctx governs their lifetime.
func (c *Coordinator) Start(ctx context.Context) {
	c.logger.Info("starting subsystems")

	// Disconnect the adapter when ctx is cancelled so Read() unblocks.
	go func() {
		<-ctx.Done()
		if err := c.adapter.Disconnect(); err != nil {
			c.logger.Warn("adapter disconnect", "err", err)
		}
	}()

	go c.screen.Run(ctx)
	go c.input.Run(ctx)
	go c.sync.Run(ctx)
	go c.runTelemetryLoop(ctx)

	// Load persisted bindings into the detector after all subsystems are running.
	c.ReloadInputBindings()
}

// CaptureNextButton waits for the first new wheel button press detected by the
// OS gamepad API. Returns the 1-indexed button number or an error.
// timeoutSecs is clamped to the range [1, 10].
func (c *Coordinator) CaptureNextButton(ctx context.Context, timeoutSecs int) (int, error) {
	if timeoutSecs < 1 {
		timeoutSecs = 1
	}
	if timeoutSecs > 10 {
		timeoutSecs = 10
	}
	return c.input.CaptureNextButton(ctx, time.Duration(timeoutSecs)*time.Second)
}

// Stop shuts down all subsystems gracefully.
func (c *Coordinator) Stop() {
	c.logger.Info("stopping")
}

const reconnectDelay = 5 * time.Second

// IsConnected reports whether the game adapter is currently connected.
func (c *Coordinator) IsConnected() bool {
	return c.connected
}

// runTelemetryLoop connects to the game adapter and streams telemetry frames to
// all subsystems. On read error it logs and retries after reconnectDelay.
// Returns when ctx is cancelled.
func (c *Coordinator) runTelemetryLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		if err := c.adapter.Connect(); err != nil {
			c.logger.Warn("game adapter connect failed, retrying",
				"game", c.adapter.Name(), "err", err, "delay", reconnectDelay)
			select {
			case <-ctx.Done():
				return
			case <-time.After(reconnectDelay):
			}
			continue
		}
		c.logger.Info("game adapter connected", "game", c.adapter.Name())
		c.connected = true
		c.emit("telemetry:connected")

		c.readLoop(ctx)

		c.connected = false
		c.emit("telemetry:disconnected")
		c.screen.SetIdle(true)
		c.idleState = true
		c.logger.Info("game adapter disconnected, will reconnect", "delay", reconnectDelay)
		select {
		case <-ctx.Done():
			return
		case <-time.After(reconnectDelay):
		}
	}
}

// readLoop reads telemetry frames until the adapter errors or ctx is cancelled.
func (c *Coordinator) readLoop(ctx context.Context) {
	var frameCount int
	lastLog := time.Now()

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		frame, err := c.adapter.Read()
		if err != nil {
			if errors.Is(err, lemansultimate.ErrDisconnected) {
				return // adapter was intentionally closed (ctx cancelled)
			}
			c.logger.Warn("telemetry read error", "err", err)
			return // trigger reconnect
		}

		frameCount++
		if elapsed := time.Since(lastLog); elapsed >= 5*time.Second {
			c.logger.Info("telemetry frames", "count", frameCount, "rate", frameCount/int(elapsed.Seconds()))
			frameCount = 0
			lastLog = time.Now()
		}

		c.fanOut(frame)
	}
}

// firstPageName returns the name of the first page in the layout, or an empty
// string if the layout is nil or has no pages.
func firstPageName(layout *dashboard.DashLayout) string {
	if layout != nil && len(layout.Pages) > 0 {
		return layout.Pages[0].Name
	}
	return ""
}

// Internal subsystems receive every frame; the frontend is throttled to ~30 Hz.
func (c *Coordinator) fanOut(frame *dto.TelemetryFrame) {
	c.updateIdleState(frame)
	c.screen.OnFrame(frame)

	// Throttled emit to Wails frontend
	now := time.Now()
	if now.Sub(c.lastFrontendEmit) >= frontendFrameInterval {
		c.emit("telemetry:frame", frame)
		c.lastFrontendEmit = now
	}
}
