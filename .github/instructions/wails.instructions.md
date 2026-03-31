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

The coordinator (`internal/coordinator/`) wires all subsystems:

- Constructor-injected dependencies (logger, devices manager)
- Each subsystem gets a tagged child logger: `logger.With("component", "name")`
- Event emission via a closure (`SetEmit(EmitFn)`) set after Wails startup
- No business logic in the coordinator — only wiring and lifecycle management
- Frame rate throttled to ~30 Hz (33ms) for frontend updates

## Internal Package Conventions

- `internal/render/` — dashboard image painter (`Painter`, widget registry, all widget implementations)
- `internal/vocore/` — VoCore USB screen driver (`Driver`, WinUSB transport, RGB565 conversion)
- `internal/devices/` — USB device detection, screen config, serial port management
- `internal/engineer/` — WebSocket server for LAN race engineers
- `internal/wheel/` — button detector, valid-lap finder
- `internal/dash/` — layout types and manager
- `internal/setup/` — local car/track setup file manager
- `internal/sync/` — API server sync client
- `internal/logger/` — structured logging via `slog`

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
