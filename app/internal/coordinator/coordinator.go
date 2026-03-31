// Package coordinator wires all backend services together.
// It owns no business logic — it starts, stops, and connects the other packages.
package coordinator

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/kratofl/sprint/app/internal/dash"
	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/app/internal/engineer"
	"github.com/kratofl/sprint/app/internal/setup"
	"github.com/kratofl/sprint/app/internal/sync"
	"github.com/kratofl/sprint/app/internal/vocore"
	"github.com/kratofl/sprint/app/internal/wheel"
	"github.com/kratofl/sprint/pkg/dto"
	"github.com/kratofl/sprint/pkg/games"
	"github.com/kratofl/sprint/pkg/games/lemansultimate"
)

// EmitFn is a function that emits a named event with arbitrary data to the
// Wails frontend. It matches the signature of runtime.EventsEmit.
type EmitFn func(event string, data ...any)

// Coordinator is the top-level wiring of all backend subsystems.
type Coordinator struct {
	logger   *slog.Logger
	adapter  games.GameAdapter
	engineer *engineer.Hub
	vocore   *vocore.Renderer
	wheel    *wheel.Detector
	sync     *sync.Client
	setup    *setup.Manager

	emit EmitFn // Wails runtime event emitter; no-op until SetEmit is called

	// Throttle: frontend receives at most one frame per frontendFrameInterval.
	lastFrontendEmit time.Time

	connected bool // true while the game adapter is live
}

const frontendFrameInterval = 33 * time.Millisecond // ~30 Hz

// New creates a Coordinator. logger is the root application logger;
// each subsystem receives a child logger tagged with its component name.
// dashMgr is used to load the saved layout on startup; it may be nil (no
// saved layout — the renderer falls back to its hardcoded default layout).
func New(logger *slog.Logger, devs *devices.Manager, dashMgr *dash.Manager) *Coordinator {
	r := vocore.NewRenderer(logger.With("component", "vocore"))

	// Load VoCore screen config from disk. Falls back to model registry only if
	// no screen.json is present (backward compat with pre-alpha installs).
	if cfg, err := devices.LoadVoCoreConfig(); err == nil && cfg != nil {
		r.SetScreen(vocore.ScreenConfig{
			VID:    cfg.VID,
			PID:    cfg.PID,
			Width:  cfg.Width,
			Height: cfg.Height,
		})
	} else if active := devs.GetActive(); active != nil {
		if model := devices.FindModel(active.ModelID); model != nil && model.ScreenVID != 0 {
			r.SetScreen(vocore.ScreenConfig{
				VID:    model.ScreenVID,
				PID:    model.ScreenPID,
				Width:  model.ScreenWidth,
				Height: model.ScreenHeight,
			})
		}
	}

	// Load saved dash layout; renderer will use the hardcoded default if nil.
	if dashMgr != nil {
		if layout, err := dashMgr.Load(); err == nil && layout != nil {
			r.SetLayout(layout)
		}
	}

	return &Coordinator{
		logger:   logger,
		adapter:  lemansultimate.New(),
		engineer: engineer.NewHub(logger.With("component", "engineer")),
		vocore:   r,
		wheel:    wheel.NewDetector(logger.With("component", "wheel")),
		sync:     sync.NewClient(logger.With("component", "sync")),
		setup:    setup.NewManager(),
		emit:     func(string, ...any) {}, // safe no-op before Wails startup
	}
}

// SetEmit provides the Wails runtime event emitter after the Wails context is
// available. Call this from App.Startup before Start.
func (c *Coordinator) SetEmit(fn EmitFn) {
	if fn != nil {
		c.emit = fn
	}
}

// SetVoCoreConfig updates the VoCore screen configuration and reconfigures the
// renderer. Safe to call after startup; the renderer will reconnect on the next
// tick if the VID/PID changed.
func (c *Coordinator) SetVoCoreConfig(cfg *devices.VoCoreConfig) {
	if cfg == nil {
		return
	}
	c.vocore.SetScreen(vocore.ScreenConfig{
		VID:    cfg.VID,
		PID:    cfg.PID,
		Width:  cfg.Width,
		Height: cfg.Height,
	})
}

// SetDashLayout updates the layout used by the VoCore renderer. Takes effect
// on the next rendered frame.
func (c *Coordinator) SetDashLayout(layout *dash.DashLayout) {
	c.vocore.SetLayout(layout)
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

	go c.engineer.Run(ctx)
	go c.vocore.Run(ctx)
	go c.wheel.Run(ctx, c.engineer)
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
	c.engineer.Broadcast(&dto.EngineerEvent{
		Type:      dto.EvtTelemetryFrame,
		Payload:   frame,
		Timestamp: time.Now().UnixMilli(),
	})
	c.vocore.OnFrame(frame)
	c.wheel.OnFrame(frame)

	// Throttled emit to Wails frontend
	now := time.Now()
	if now.Sub(c.lastFrontendEmit) >= frontendFrameInterval {
		c.emit("telemetry:frame", frame)
		c.lastFrontendEmit = now
	}
}
