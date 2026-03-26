package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/kratofl/sprint/app/internal/coordinator"
	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/app/internal/logger"
	"github.com/kratofl/sprint/app/internal/setup"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails application struct. Its exported methods are bound to the
// frontend and callable from TypeScript via the generated Wails bindings.
type App struct {
	ctx     context.Context
	coord   *coordinator.Coordinator
	setups  *setup.Manager
	devices *devices.Manager
}

// NewApp creates a new App instance. Wails calls this before Startup.
func NewApp() *App {
	return &App{}
}

// Startup is called when the Wails app starts. The context is used for
// runtime calls such as opening dialogs or emitting events.
// We only create subsystems here; Start is deferred to DomReady so that
// the frontend event listeners are registered before we emit any events.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	log := logger.Init(logger.DefaultConfig())
	a.devices = devices.NewManager()
	a.coord = coordinator.New(log, a.devices)
	a.coord.SetEmit(func(event string, data ...any) {
		runtime.EventsEmit(ctx, event, data...)
	})
	a.setups = setup.NewManager()
}

// DomReady is called after the frontend DOM is fully loaded and scripts have
// executed. We start subsystems here so that Wails events fired by the
// coordinator are not lost before React has mounted its event listeners.
func (a *App) DomReady(ctx context.Context) {
	a.coord.Start(ctx)
}

// IsConnected reports whether the game adapter is currently connected.
// Called by the frontend on mount to initialise connection state without
// relying on a potentially-missed telemetry:connected event.
func (a *App) IsConnected() bool {
	return a.coord.IsConnected()
}

// Shutdown is called when the app is closing.
func (a *App) Shutdown(_ context.Context) {
	if a.coord != nil {
		a.coord.Stop()
	}
}

// ── Setup bindings ──────────────────────────────────────────────────────────
// All exported methods below are automatically bound to the frontend by Wails.

// SetupListAll returns every setup stored on disk, across all cars and tracks.
func (a *App) SetupListAll() ([]setup.Setup, error) {
	items, err := a.setups.ListAll()
	if err != nil {
		return nil, fmt.Errorf("SetupListAll: %w", err)
	}
	result := make([]setup.Setup, 0, len(items))
	for _, s := range items {
		result = append(result, *s)
	}
	return result, nil
}

// SetupSave writes a setup to disk. If s.ID is empty a new UUID is assigned.
func (a *App) SetupSave(s setup.Setup) (setup.Setup, error) {
	if s.ID == "" {
		s.ID = uuid.NewString()
	}
	if s.Name == "" || s.Car == "" || s.Track == "" {
		return setup.Setup{}, fmt.Errorf("name, car and track are required")
	}
	if err := a.setups.Save(&s); err != nil {
		return setup.Setup{}, fmt.Errorf("SetupSave: %w", err)
	}
	return s, nil
}

// SetupDelete removes a setup file from disk.
func (a *App) SetupDelete(car, track, id string) error {
	if err := a.setups.Delete(car, track, id); err != nil {
		return fmt.Errorf("SetupDelete: %w", err)
	}
	return nil
}

// ── Device bindings ──────────────────────────────────────────────────────────

// DeviceListKnownModels returns all wheel models supported by the registry.
func (a *App) DeviceListKnownModels() []devices.WheelModel {
	return devices.KnownModels
}

// DeviceListPorts scans all serial ports and returns them annotated with
// matched wheel models. Matched ports are listed first.
func (a *App) DeviceListPorts() ([]devices.DetectedPort, error) {
	ports, err := devices.ListPorts()
	if err != nil {
		return nil, fmt.Errorf("DeviceListPorts: %w", err)
	}
	return ports, nil
}

// DeviceGetAll returns all user-configured devices.
func (a *App) DeviceGetAll() []devices.DeviceConfig {
	return a.devices.GetAll()
}

// DeviceSave adds or updates a device. A new UUID is assigned if d.ID is empty.
func (a *App) DeviceSave(d devices.DeviceConfig) (devices.DeviceConfig, error) {
	saved, err := a.devices.Save(d)
	if err != nil {
		return devices.DeviceConfig{}, fmt.Errorf("DeviceSave: %w", err)
	}
	return saved, nil
}

// DeviceDelete removes a configured device by its ID.
func (a *App) DeviceDelete(id string) error {
	if err := a.devices.Delete(id); err != nil {
		return fmt.Errorf("DeviceDelete: %w", err)
	}
	return nil
}
