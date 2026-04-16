---
description: 'Conventions for the Wails desktop app: Go backend bindings, coordinator pattern, event emission, lifecycle hooks, and frontend embedding.'
applyTo: 'app/**/*.go'
---

# Wails Desktop App Conventions

## Architecture

The desktop app uses [Wails v2](https://wails.io) — Go backend + embedded React/TS frontend.

- `main.go` embeds `frontend/dist/` via `//go:embed all:frontend/dist`
- `app.go` contains the `App` struct with Wails lifecycle methods and frontend-bound methods
- All business logic lives in `internal/` — the App struct is a thin binding layer

## Lifecycle

1. `Startup(ctx)` — called when Wails starts; initialize services here
2. `DomReady(ctx)` — called when the frontend is ready; start subsystems that emit events here
3. `Shutdown(ctx)` — called on exit; clean up resources

**Rule:** Defer subsystem `.Start()` to `DomReady`, not `Startup`, so frontend event listeners are registered before events fire.

## Bindings

- Exported methods on the `App` struct are auto-exposed to the frontend via Wails codegen
- Keep bindings thin — they should call internal services and return results, not contain logic
- Frontend calls appear as `window.go.main.App.MethodName()`

## Coordinator Pattern

The coordinator (`internal/core/`) wires all subsystems:

- Constructor-injected dependencies (logger, devices manager)
- Each subsystem gets a tagged child logger: `logger.With("component", "name")`
- Event emission via a closure (`SetEmit(EmitFn)`) set after Wails startup
- No business logic in the coordinator — only wiring and lifecycle management
- Frame rate throttled to ~30 Hz (33ms) for frontend updates

## Internal Package Conventions

- `internal/core/` — coordinator: wires all subsystems, owns the telemetry read loop; no business logic
- `internal/hardware/` — `ScreenDriver` interface + `VoCoreDriver` + `USBD480Driver`; `baseDriver` shared render/send loop; `factory.go` for construction
- `internal/dashboard/` — `DashLayout` model, `Manager` (JSON file repo), `Painter` (gg canvas renderer), `widgets/` (self-registering via `init()`), `alerts/`, `config/`
- `internal/devices/` — device registry persistence (`devices.json`); `DeviceType`, `DevicePurpose`, `DriverType`, `CatalogEntry`; no USB scanning (that lives in `hardware/`)
- `internal/input/` — wheel button detector (`Detector`); maps button numbers to `commands.Command` strings
- `internal/delta/` — position-based lap delta tracker (`Tracker`, `Store`, `ReferenceLap`); handles valid-lap detection and manual reference selection
- `internal/commands/` — global button-to-action registry; `Handle(cmd, fn)` + `Dispatch(cmd, payload)`
- `internal/capture/` — Windows screen capture (GDI) for rear-view mirror feature; transparent overlay window
- `internal/updater/` — GitHub Releases checker + one-click self-replace installer (Windows)
- `internal/settings/` — persistent app preferences (`settings.json`); update channel, etc.
- `internal/appdata/` — platform config directory resolver (`%APPDATA%\Sprint\` on Windows)
- `internal/logger/` — `log/slog` wrapper; `Init()` + multi-writer (file + console)

## Event Emission

Use `runtime.EventsEmit(ctx, eventName, data)` for Go→frontend communication. The coordinator wraps this in an `EmitFn` closure:

```go
type EmitFn func(eventName string, data ...interface{})
```

Frontend listens via Wails runtime: `EventsOn(eventName, callback)`.

## Version Injection

Version is injected at build time via `-ldflags`:

```go
var Version = "dev" // overridden by: -X main.Version=1.2.3
```

## Testing

- Test internal packages in isolation — mock the coordinator's dependencies
- The coordinator itself is tested via integration tests
- Frontend tests use Vitest (see `app/frontend/`)
