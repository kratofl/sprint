// Package core wires all backend services together.
// It owns no business logic - it starts, stops, and connects the other packages.
package core

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/kratofl/sprint/app/internal/commands"
	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/app/internal/hardware"
	"github.com/kratofl/sprint/app/internal/input"
	"github.com/kratofl/sprint/pkg/dto"
	"github.com/kratofl/sprint/pkg/games"
	"github.com/kratofl/sprint/pkg/games/lemansultimate"
)

// EmitFn is a function that emits a named event with arbitrary data to the
// Wails frontend. It matches the signature of runtime.EventsEmit.
type EmitFn func(event string, data ...any)

// deviceEntry holds the runtime state for a single registered device.
type deviceEntry struct {
	driver        hardware.ScreenDriver // nil for button-box type devices
	pageIndex     int
	layoutID      string
	currentLayout *dashboard.DashLayout // stored for page count during CyclePage
	cancel        context.CancelFunc
}

// Coordinator is the top-level wiring of all backend subsystems.
type Coordinator struct {
	logger  *slog.Logger
	adapter games.GameAdapter
	input   *input.Detector
	devMgr  *devices.Manager
	dashMgr *dashboard.Manager

	emit EmitFn

	// frontendEmitCh carries the latest telemetry frame to the dedicated
	// frontend-emitter goroutine. Buffered 1; a non-blocking send in fanOut
	// overwrites any stale pending frame (latest-value semantics). This
	// decouples readLoop from the Wails IPC latency that was causing the
	// effective frontend rate to drop from the target 30 Hz to ~24 Hz.
	frontendEmitCh chan *dto.TelemetryFrame

	connected bool
	idleState bool

	mu      sync.RWMutex
	entries map[string]*deviceEntry // deviceID -> entry

	rootCtx context.Context // set by Start; used when adding devices at runtime
}

const frontendFrameInterval = 33 * time.Millisecond // ~30 Hz

// New creates a Coordinator. logger is the root application logger;
// each subsystem receives a child logger tagged with its component name.
// dashMgr and devMgr are used to restore the saved layout and screen on startup.
func New(logger *slog.Logger, dashMgr *dashboard.Manager, devMgr *devices.Manager) *Coordinator {
	c := &Coordinator{
		logger:         logger,
		adapter:        lemansultimate.New(),
		input:          input.NewDetector(logger.With("component", "input")),
		emit:           func(string, ...any) {},
		devMgr:         devMgr,
		dashMgr:        dashMgr,
		entries:        map[string]*deviceEntry{},
		idleState:      true,
		frontendEmitCh: make(chan *dto.TelemetryFrame, 1),
	}

	if devMgr != nil {
		if reg, err := devMgr.Load(); err == nil {
			for i := range reg.Devices {
				d := &reg.Devices[i]
				if !d.HasScreen() {
					continue
				}
				id := devices.DeviceID(d.VID, d.PID, d.Serial)
				drv, drvErr := hardware.NewDriver(d.Driver, logger.With("component", "screen", "device", id))
				if drvErr != nil {
					logger.Warn("unsupported driver, defaulting to vocore", "device", id, "err", drvErr)
					drv = hardware.NewVoCoreDriver(logger.With("component", "screen", "device", id))
				}
				drv.Configure(toHardwareScreenConfig(devices.ToScreenConfig(d)))

				entry := &deviceEntry{driver: drv, cancel: func() {}}
				if dashMgr != nil {
					if layout, lerr := dashMgr.Load(d.DashID); lerr == nil && layout != nil {
						drv.SetLayout(layout)
						entry.layoutID = layout.ID
						entry.currentLayout = layout
					} else if lerr != nil {
						logger.Warn("failed to load dash layout for device, screen will render black", "device", id, "err", lerr)
					}
				}
				drv.SetIdle(true)
				c.entries[id] = entry
			}
		}
	}

	commands.Handle(dashboard.CmdNextDashPage, func(p any) {
		screenID, _ := p.(string)
		c.CyclePage(screenID, +1)
	})
	commands.Handle(dashboard.CmdPrevDashPage, func(p any) {
		screenID, _ := p.(string)
		c.CyclePage(screenID, -1)
	})

	return c
}

// SetEmit provides the Wails runtime event emitter. Call from App.Startup before Start.
func (c *Coordinator) SetEmit(fn EmitFn) {
	if fn == nil {
		return
	}
	c.emit = fn
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, e := range c.entries {
		if e.driver != nil {
			e.driver.SetEmit(fn)
		}
	}
}

// Start launches all subsystems. ctx governs their lifetime.
func (c *Coordinator) Start(ctx context.Context) {
	c.logger.Info("starting subsystems")

	c.mu.Lock()
	c.rootCtx = ctx
	// Assign a child context + cancel to each pre-loaded entry.
	for _, e := range c.entries {
		if e.driver == nil {
			continue
		}
		childCtx, cancel := context.WithCancel(ctx)
		e.cancel = cancel
		go e.driver.Run(childCtx)
	}
	c.mu.Unlock()

	go func() {
		<-ctx.Done()
		if err := c.adapter.Disconnect(); err != nil {
			c.logger.Warn("adapter disconnect", "err", err)
		}
	}()

	go c.input.Run(ctx)
	go c.runTelemetryLoop(ctx)
	go c.runFrontendEmitter(ctx)

	c.ReloadInputBindings()
}

// SetScreenConfig updates the configuration for a specific device. If the
// device is new (not yet in the map), a driver is created and started.
func (c *Coordinator) SetScreenConfig(deviceID string, d devices.SavedDevice) {
	if !d.HasScreen() {
		return
	}
	cfg := toHardwareScreenConfig(devices.ToScreenConfig(&d))

	c.mu.Lock()
	e, exists := c.entries[deviceID]
	if exists && e.driver != nil {
		e.driver.Configure(cfg)
		c.mu.Unlock()
		c.ReloadInputBindings()
		return
	}

	drv, err := hardware.NewDriver(d.Driver, c.logger.With("component", "screen", "device", deviceID))
	if err != nil {
		c.logger.Warn("unsupported driver, defaulting to vocore", "device", deviceID, "err", err)
		drv = hardware.NewVoCoreDriver(c.logger.With("component", "screen", "device", deviceID))
	}
	drv.Configure(cfg)
	drv.SetIdle(c.idleState)
	drv.SetEmit(c.emit)

	var cancel context.CancelFunc = func() {}
	if c.rootCtx != nil {
		childCtx, cf := context.WithCancel(c.rootCtx)
		cancel = cf
		go drv.Run(childCtx)
	}

	entry := &deviceEntry{driver: drv, cancel: cancel}
	if c.dashMgr != nil {
		if layout, lerr := c.dashMgr.Load(d.DashID); lerr == nil && layout != nil {
			drv.SetLayout(layout)
			entry.layoutID = layout.ID
			entry.currentLayout = layout
		} else if lerr != nil {
			c.logger.Warn("failed to load dash layout for device", "device", deviceID, "err", lerr)
		}
	}

	if exists {
		e.driver = drv
		e.cancel = cancel
	} else {
		c.entries[deviceID] = entry
	}
	c.mu.Unlock()

	c.ReloadInputBindings()
}

// SetDashLayout assigns a dash layout to a specific screen-capable device.
func (c *Coordinator) SetDashLayout(deviceID string, layout *dashboard.DashLayout) {
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.entries[deviceID]
	if !ok || e.driver == nil {
		return
	}
	e.driver.SetLayout(layout)
	e.layoutID = layout.ID
	e.currentLayout = layout
	e.pageIndex = 0
	e.driver.SetActivePage(0)
}

// UpdateLayout hot-reloads any screen whose current layout matches layout.ID.
func (c *Coordinator) UpdateLayout(layout *dashboard.DashLayout) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, e := range c.entries {
		if e.driver != nil && e.layoutID == layout.ID {
			e.driver.SetLayout(layout)
			e.currentLayout = layout
		}
	}
}

// CyclePage advances the page on deviceID, or all screen-capable devices when
// deviceID is empty. Each device advances within its own layout page count.
func (c *Coordinator) CyclePage(deviceID string, direction int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for id, e := range c.entries {
		if deviceID != "" && id != deviceID {
			continue
		}
		if e.driver == nil || e.currentLayout == nil || len(e.currentLayout.Pages) == 0 {
			continue
		}
		n := len(e.currentLayout.Pages)
		e.pageIndex = ((e.pageIndex+direction)%n + n) % n
		e.driver.SetActivePage(e.pageIndex)
		c.emit("dash:page-changed", map[string]any{
			"deviceID":  id,
			"pageIndex": e.pageIndex,
			"pageName":  e.currentLayout.Pages[e.pageIndex].Name,
		})
	}
}

// GetScreenStatus returns "connected" if any screen-capable driver is connected.
func (c *Coordinator) GetScreenStatus() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, e := range c.entries {
		if e.driver != nil && e.driver.IsConnected() {
			return "connected"
		}
	}
	return "disconnected"
}

// SetDevicePaused pauses or resumes rendering for the given device.
func (c *Coordinator) SetDevicePaused(deviceID string, paused bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if e, ok := c.entries[deviceID]; ok && e.driver != nil {
		e.driver.SetPaused(paused)
	}
}

// GetDevicePaused reports whether the given device's rendering is paused.
func (c *Coordinator) GetDevicePaused(deviceID string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if e, ok := c.entries[deviceID]; ok && e.driver != nil {
		return e.driver.GetPaused()
	}
	return false
}

// RemoveDevice stops and removes the device entry with the given ID.
func (c *Coordinator) RemoveDevice(deviceID string) {
	c.mu.Lock()
	e, ok := c.entries[deviceID]
	if ok {
		delete(c.entries, deviceID)
	}
	c.mu.Unlock()
	if ok && e.cancel != nil {
		e.cancel()
	}
	c.ReloadInputBindings()
}

// IsConnected reports whether the game adapter is currently connected.
func (c *Coordinator) IsConnected() bool {
	return c.connected
}

// ReloadInputBindings merges global controls config with per-device bindings
// and pushes the combined table to the input detector.
func (c *Coordinator) ReloadInputBindings() {
	var merged []input.Binding

	if cfg, err := input.LoadConfig(); err == nil {
		for _, b := range cfg.Bindings {
			merged = append(merged, b) // VID/PID zero = wildcard
		}
	} else {
		c.logger.Warn("input: failed to load controls config", "err", err)
	}

	if c.devMgr != nil {
		if reg, err := c.devMgr.Load(); err == nil {
			for _, d := range reg.Devices {
				id := devices.DeviceID(d.VID, d.PID, d.Serial)
				// Non-screen devices (button boxes) broadcast to all screens (ScreenID="").
				// Screen-capable devices (wheel, screen) target their own entry.
				screenID := id
				if !d.HasScreen() {
					screenID = ""
				}
				for _, db := range d.Bindings {
					if db.Button > 0 && db.Command != "" {
						merged = append(merged, input.Binding{
							Button:    db.Button,
							Command:   commands.Command(db.Command),
							DeviceVID: 0,
							DevicePID: 0,
							ScreenID:  screenID,
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

// CaptureNextButton waits for the first new wheel button press.
// timeoutSecs is clamped to [1, 10].
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
		c.setAllIdle(true)
		c.idleState = true
		c.logger.Info("game adapter disconnected, will reconnect", "delay", reconnectDelay)
		select {
		case <-ctx.Done():
			return
		case <-time.After(reconnectDelay):
		}
	}
}

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
				return
			}
			c.logger.Warn("telemetry read error", "err", err)
			return
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

func (c *Coordinator) updateIdleState(frame *dto.TelemetryFrame) {
	isIdle := !frame.Session.InCar
	if isIdle == c.idleState {
		return
	}
	c.idleState = isIdle
	c.setAllIdle(isIdle)

	if !isIdle {
		// Snap all screens back to page 0 on session start.
		c.mu.Lock()
		for id, e := range c.entries {
			if e.driver == nil {
				continue
			}
			e.pageIndex = 0
			e.driver.SetActivePage(0)
			pageName := ""
			if e.currentLayout != nil && len(e.currentLayout.Pages) > 0 {
				pageName = e.currentLayout.Pages[0].Name
			}
			c.emit("dash:page-changed", map[string]any{
				"deviceID":  id,
				"pageIndex": 0,
				"pageName":  pageName,
			})
		}
		c.mu.Unlock()
	}
}

func (c *Coordinator) setAllIdle(idle bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, e := range c.entries {
		if e.driver != nil {
			e.driver.SetIdle(idle)
		}
	}
}

func (c *Coordinator) fanOut(frame *dto.TelemetryFrame) {
	c.updateIdleState(frame)

	c.mu.RLock()
	for _, e := range c.entries {
		if e.driver != nil {
			e.driver.OnFrame(frame)
		}
	}
	c.mu.RUnlock()

	// Non-blocking send: if the emitter goroutine hasn't consumed the previous
	// frame yet, overwrite it with the latest (latest-value semantics).
	select {
	case c.frontendEmitCh <- frame:
	default:
		// Drain the stale frame and replace with the current one.
		select {
		case <-c.frontendEmitCh:
		default:
		}
		select {
		case c.frontendEmitCh <- frame:
		default:
		}
	}
}

func toHardwareScreenConfig(cfg devices.ScreenConfig) hardware.ScreenConfig {
	return hardware.ScreenConfig{
		VID:       cfg.VID,
		PID:       cfg.PID,
		Width:     cfg.Width,
		Height:    cfg.Height,
		Rotation:  cfg.Rotation,
		TargetFPS: cfg.TargetFPS,
		OffsetX:   cfg.OffsetX,
		OffsetY:   cfg.OffsetY,
	}
}

// runFrontendEmitter runs in its own goroutine and emits telemetry:frame
// Wails events at frontendFrameInterval. It consumes frames from
// frontendEmitCh (latest-value channel) so the readLoop goroutine is never
// blocked by Wails IPC latency.
func (c *Coordinator) runFrontendEmitter(ctx context.Context) {
	ticker := time.NewTicker(frontendFrameInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			select {
			case frame := <-c.frontendEmitCh:
				c.emit("telemetry:frame", frame)
			default:
			}
		}
	}
}
