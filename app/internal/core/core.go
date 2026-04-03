// Package core wires all backend services together.
// It owns no business logic — it starts, stops, and connects the other packages.
package core

import (
	"context"
	"errors"
	"log/slog"
	"time"

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

	emit EmitFn // Wails runtime event emitter; no-op until SetEmit is called

	// Throttle: frontend receives at most one frame per frontendFrameInterval.
	lastFrontendEmit time.Time

	connected bool // true while the game adapter is live
}

const frontendFrameInterval = 33 * time.Millisecond // ~30 Hz

// New creates a Coordinator. logger is the root application logger;
// each subsystem receives a child logger tagged with its component name.
// dashMgr and devMgr are used to restore the saved layout and screen on startup.
func New(logger *slog.Logger, dashMgr *dashboard.Manager, devMgr *devices.Manager) *Coordinator {
	screen := hardware.NewVoCoreDriver(logger.With("component", "screen"))

	// Load screen config from the device registry.
	if devMgr != nil {
		if reg, err := devMgr.Load(); err == nil {
			if active := devices.ActiveScreen(reg); active != nil {
				screen.SetScreen(voCoreConfigFrom(devices.ToScreenConfig(active)))
			}
		}
	}

	// Load saved dash layout; Load() returns the embedded default when no
	// user layout file exists, so the renderer always has a layout to use.
	if dashMgr != nil {
		if layout, err := dashMgr.Load(); err == nil && layout != nil {
			screen.SetLayout(layout)
		}
	}

	c := &Coordinator{
		logger:  logger,
		adapter: lemansultimate.New(),
		screen:  screen,
		input:   input.NewDetector(logger.With("component", "input")),
		sync:    springsync.NewClient(logger.With("component", "sync")),
		emit:    func(string, ...any) {}, // safe no-op before Wails startup
	}

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

// SetDashLayout updates the layout used by the VoCore renderer. Takes effect
// on the next rendered frame.
func (c *Coordinator) SetDashLayout(layout *dashboard.DashLayout) {
	c.screen.SetLayout(layout)
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

// fanOut distributes a telemetry frame to all live subsystems.
// Internal subsystems receive every frame; the frontend is throttled to ~30 Hz.
func (c *Coordinator) fanOut(frame *dto.TelemetryFrame) {
	c.screen.OnFrame(frame)

	// Throttled emit to Wails frontend
	now := time.Now()
	if now.Sub(c.lastFrontendEmit) >= frontendFrameInterval {
		c.emit("telemetry:frame", frame)
		c.lastFrontendEmit = now
	}
}
