## Wails Guidance

### Architecture

- `app/main.go` embeds `frontend/dist/`.
- `app/app.go` exposes the Wails-bound `App` methods.
- Keep the `App` struct thin. Put business logic in `app/internal/`.
- Prefer service delegation from `app/app*.go` when the same
  load-update-save-hot-reload flow appears in multiple bindings.
- `docs/desktop/README.md` is the implementation-facing companion to this file.

### Lifecycle

1. `Startup(ctx)` initializes services.
2. `DomReady(ctx)` starts subsystems that emit frontend events.
3. `Shutdown(ctx)` cleans up resources.

Defer subsystem startup that emits events until `DomReady` so the frontend has listeners attached.

### Development

- Start the desktop app with `cd app && wails dev`.
- Browser-safe desktop UI checks can use the Vite page at `http://localhost:5173/` while `cd app && wails dev` is running.
- For desktop-bound browser inspection, run `make dev-app-agent`. This starts `wails dev` with a fixed Wails browser URL using `-devserver localhost:<port>`, with `SPRINT_WAILS_DEVSERVER_PORT` defaulting to `34115`.
- After launching `make dev-app-agent`, run `pwsh -File .\app\scripts\wait-desktop-browser.ps1` and open `http://127.0.0.1:34115` or the port from `SPRINT_WAILS_DEVSERVER_PORT` with Playwright MCP.
- Use the Wails browser surface for flows that need generated bindings or runtime methods. The plain Vite page at `http://localhost:5173/` does not provide those bindings.

### Bindings

- Exported `App` methods are frontend-callable through Wails codegen.
- Generated bindings in `app/frontend/wailsjs/go/main/App` are the source of
  truth for frontend calls.
- Frontend code should wrap generated bindings in small typed helpers under
  `app/frontend/src/lib/` instead of using raw string-based call helpers.
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
- Prefer typed payload structs over `map[string]any` when the event shape is
  stable.
- Frontend event names and payloads should be centrally owned in
  `app/frontend/src/lib/desktopEvents.ts`.
- Frontend listeners should subscribe through the typed `onEvent(...)` helper in
  `app/frontend/src/lib/wails.ts`.

Current event domains:

- `app`
- `telemetry`
- `dash`
- `screen`
- `devices`
- `update`

When adding a new event:

1. emit a typed Go payload where practical;
2. register the event name and payload in `desktopEvents.ts`;
3. subscribe through `onEvent(...)` in the frontend.

### Versioning

- Version is injected at build time through `-ldflags`.

### Testing

- Test internal packages in isolation where possible.
- Use integration tests for coordinator-level behavior.
- Add focused tests for extracted frontend adapters/event modules and internal
  services when refactoring desktop boundary code.
