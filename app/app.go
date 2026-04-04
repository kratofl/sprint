package main

import (
	"context"
	"strings"

	"github.com/kratofl/sprint/app/internal/core"
	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/app/internal/logger"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the Wails application struct. Its exported methods are bound to the
// frontend and callable from TypeScript via the generated Wails bindings.
type App struct {
	ctx     context.Context
	version string
	coord   *core.Coordinator
	dash    *dashboard.Manager
	devMgr  *devices.Manager
}

// NewApp creates a new App instance. Wails calls this before Startup.
func NewApp(version string) *App {
	return &App{version: version}
}

// Startup is called when the Wails app starts. The context is used for
// runtime calls such as opening dialogs or emitting events.
// We only create subsystems here; Start is deferred to DomReady so that
// the frontend event listeners are registered before we emit any events.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	log := logger.Init(logger.DefaultConfig())
	a.dash = dashboard.NewManager()
	a.devMgr = devices.NewManager()
	a.coord = core.New(log, a.dash, a.devMgr)
	a.coord.SetEmit(func(event string, data ...any) {
		runtime.EventsEmit(ctx, event, data...)
	})
}

// DomReady is called after the frontend DOM is fully loaded and scripts have
// executed. We start subsystems here so that Wails events fired by the
// coordinator are not lost before React has mounted its event listeners.
func (a *App) DomReady(ctx context.Context) {
	a.coord.Start(ctx)
	runtime.EventsEmit(ctx, "app:ready")
}

// IsConnected reports whether the game adapter is currently connected.
// Called by the frontend on mount to initialise connection state without
// relying on a potentially-missed telemetry:connected event.
func (a *App) IsConnected() bool {
	return a.coord.IsConnected()
}

// GetVersion returns the application version string injected at build time.
func (a *App) GetVersion() string {
	return a.version
}

// GetBuildChannel returns the release channel derived from the version string:
// "dev" for local builds, "alpha", "beta" if the version contains those words,
// or "release" for any other versioned build.
func (a *App) GetBuildChannel() string {
	v := strings.ToLower(a.version)
	switch {
	case v == "dev":
		return "dev"
	case strings.Contains(v, "alpha"):
		return "alpha"
	case strings.Contains(v, "beta"):
		return "beta"
	default:
		return "release"
	}
}

// WindowMinimise minimises the application window.
func (a *App) WindowMinimise() {
	runtime.WindowMinimise(a.ctx)
}

// WindowMaximise toggles the application window between maximised and normal.
func (a *App) WindowMaximise() {
	runtime.WindowToggleMaximise(a.ctx)
}

// WindowClose closes the application window.
func (a *App) WindowClose() {
	runtime.Quit(a.ctx)
}

// Shutdown is called when the app is closing.
func (a *App) Shutdown(_ context.Context) {
	if a.coord != nil {
		a.coord.Stop()
	}
}
