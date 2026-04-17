## Wails Guidance

### Architecture

- `app/main.go` embeds `frontend/dist/`.
- `app/app.go` exposes the Wails-bound `App` methods.
- Keep the `App` struct thin. Put business logic in `app/internal/`.

### Lifecycle

1. `Startup(ctx)` initializes services.
2. `DomReady(ctx)` starts subsystems that emit frontend events.
3. `Shutdown(ctx)` cleans up resources.

Defer subsystem startup that emits events until `DomReady` so the frontend has listeners attached.

### Bindings

- Exported `App` methods are frontend-callable through Wails codegen.
- Bindings should delegate to internal services and return results.

### Coordinator

- `internal/core/` wires subsystems together and owns lifecycle orchestration.
- Keep coordination code separate from business logic.
- Use child loggers per subsystem.
- Frontend update rate is expected to stay around 30 Hz.

### Internal Packages

- `internal/core/`: subsystem wiring and orchestration
- `internal/hardware/`: screen drivers and render/send loops
- `internal/dashboard/`: layouts, painter, widgets, alerts, config
- `internal/devices/`: device persistence and registry metadata
- `internal/input/`: wheel button detection
- `internal/delta/`: lap delta tracking and reference selection
- `internal/commands/`: command registry and dispatch
- `internal/capture/`: screen capture support
- `internal/updater/`: GitHub release update flow
- `internal/settings/`: persistent preferences
- `internal/appdata/`: platform config directory resolution
- `internal/logger/`: `slog` initialization and sinks

### Events

- Use `runtime.EventsEmit(ctx, eventName, data)` for Go-to-frontend events.
- Frontend listeners should subscribe through Wails runtime event APIs.

### Versioning

- Version is injected at build time through `-ldflags`.

### Testing

- Test internal packages in isolation where possible.
- Use integration tests for coordinator-level behavior.
