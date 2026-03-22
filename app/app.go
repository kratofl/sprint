package main

import (
	"context"

	"github.com/kratofl/sprint/app/internal/coordinator"
)

// App is the Wails application struct. Its exported methods are bound to the
// frontend and callable from TypeScript via the generated Wails bindings.
type App struct {
	ctx   context.Context
	coord *coordinator.Coordinator
}

// NewApp creates a new App instance. Wails calls this before Startup.
func NewApp() *App {
	return &App{}
}

// Startup is called when the Wails app starts. The context is used for
// runtime calls such as opening dialogs or emitting events.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.coord = coordinator.New()
	a.coord.Start(ctx)
}

// DomReady is called after the frontend DOM is ready.
func (a *App) DomReady(_ context.Context) {}

// Shutdown is called when the app is closing.
func (a *App) Shutdown(_ context.Context) {
	if a.coord != nil {
		a.coord.Stop()
	}
}
