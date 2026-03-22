package main

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/kratofl/sprint/app/internal/coordinator"
	"github.com/kratofl/sprint/app/internal/logger"
	"github.com/kratofl/sprint/app/internal/setup"
)

// App is the Wails application struct. Its exported methods are bound to the
// frontend and callable from TypeScript via the generated Wails bindings.
type App struct {
	ctx    context.Context
	coord  *coordinator.Coordinator
	setups *setup.Manager
}

// NewApp creates a new App instance. Wails calls this before Startup.
func NewApp() *App {
	return &App{}
}

// Startup is called when the Wails app starts. The context is used for
// runtime calls such as opening dialogs or emitting events.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	log := logger.Init(logger.DefaultConfig())
	a.coord = coordinator.New(log)
	a.coord.Start(ctx)
	a.setups = setup.NewManager()
}

// DomReady is called after the frontend DOM is ready.
func (a *App) DomReady(_ context.Context) {}

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
