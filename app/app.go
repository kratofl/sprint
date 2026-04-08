package main

import (
	"context"
	"io/fs"
	"strings"

	"github.com/kratofl/sprint/app/internal/core"
	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/app/internal/hardware"
	"github.com/kratofl/sprint/app/internal/logger"
	"github.com/kratofl/sprint/app/internal/settings"
	"github.com/kratofl/sprint/app/internal/updater"
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

	// Inject embedded presets into packages that use them as fallback.
	if catalogFS, err := fs.Sub(PresetsFS, "presets/devices"); err == nil {
		devices.InitPresets(catalogFS)
	}
	if dashFS, err := fs.Sub(PresetsFS, "presets/dash"); err == nil {
		dashboard.InitPresets(dashFS)
	}
	if settingsFS, err := fs.Sub(PresetsFS, "presets/settings"); err == nil {
		settings.InitPresets(settingsFS)
	}

	a.dash = dashboard.NewManager()
	if err := a.dash.EnsureDefault(); err != nil {
		log.Warn("dash: failed to ensure default layout", "err", err)
	}
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

	go a.checkUpdateInBackground(ctx)
}

// checkUpdateInBackground loads the current channel setting, checks GitHub
// for a newer release, and emits update:available if one is found.
// Failures are logged and silently discarded — the user is not bothered.
func (a *App) checkUpdateInBackground(ctx context.Context) {
	s, err := settings.Load()
	if err != nil {
		return
	}
	info, err := updater.CheckLatest(a.version, s.UpdateChannel)
	if err != nil || info == nil {
		return
	}
	runtime.EventsEmit(ctx, "update:available", info)
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

// InstallScreenDriver installs the WinUSB driver binding for the given screen
// driver type ("vocore" or "usbd480"). A UAC elevation prompt will appear.
// Returns an error string if installation fails or the user cancels the UAC prompt.
func (a *App) InstallScreenDriver(driverType string) error {
	return hardware.InstallWinUSBDriver(driverType)
}

// Shutdown is called when the app is closing.
func (a *App) Shutdown(_ context.Context) {
	if a.coord != nil {
		a.coord.Stop()
	}
}

// GetSettings returns the current application settings.
func (a *App) GetSettings() (*settings.Settings, error) {
	return settings.Load()
}

// SaveSettings persists s to disk.
func (a *App) SaveSettings(s settings.Settings) error {
	return settings.Save(&s)
}

// CheckUpdate manually checks GitHub Releases for a newer version.
// Returns nil if the app is already up-to-date.
func (a *App) CheckUpdate() (*updater.ReleaseInfo, error) {
	s, err := settings.Load()
	if err != nil {
		return nil, err
	}
	return updater.CheckLatest(a.version, s.UpdateChannel)
}

// DownloadAndInstall downloads the release installer at downloadURL, launches
// it silently, then quits the app so the installer can replace the binary.
func (a *App) DownloadAndInstall(downloadURL string) error {
	if err := updater.DownloadAndInstall(a.ctx, downloadURL); err != nil {
		return err
	}
	runtime.Quit(a.ctx)
	return nil
}
