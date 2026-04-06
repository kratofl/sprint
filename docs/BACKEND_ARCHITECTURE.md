# Backend Architecture — Sprint Desktop App

A walkthrough of the Go backend for developers coming from a C# background.
This document assumes you've read `GO_AND_WAILS.md` for the basic Go/Wails concepts.

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│  Sprint Desktop App (single process, single binary)             │
│                                                                 │
│  main.go                                                        │
│    └── App struct (app.go)          ← like Program.cs           │
│          ├── Startup()              ← create services           │
│          ├── DomReady()             ← start services            │
│          └── Shutdown()             ← stop services             │
│                │                                                │
│                ▼                                                │
│         Coordinator (core.go)       ← the central service host  │
│          ├── GameAdapter            ← reads telemetry from game │
│          ├── ScreenDriver           ← drives the USB display    │
│          ├── dashboard.Manager      ← layout persistence        │
│          ├── devices.Manager        ← screen device registry    │
│          ├── input.Detector         ← wheel button detection    │
│          └── commands registry      ← button → action mapping   │
│                │                                                │
│                ▼                                                │
│         React Frontend              ← runs in embedded WebView  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Entry Point: `main.go` and `app.go`

### C# analogy: `Program.cs`

In C#, `Program.cs` sets up DI, configures services, and starts the app host. In this
project, that role is split across two files:

**`main.go`** — wires Wails options and starts the process:

```go
func main() {
    app := NewApp(Version)
    err := wails.Run(&options.App{
        Title:     "Sprint",
        Width:     1280,
        Height:    800,
        OnStartup: app.Startup,
        OnDomReady: app.DomReady,
        OnShutdown: app.Shutdown,
        Bind: []any{app},   // exposes App methods to the frontend
    })
}
```

**`app.go`** — the `App` struct is a thin binding layer between Wails and the backend:

```go
type App struct {
    ctx    context.Context   // Wails context (used for events, dialogs)
    coord  *core.Coordinator // the actual backend logic lives here
    dash   *dashboard.Manager
    devMgr *devices.Manager
}
```

> **C# equivalent:** `App` is like an ASP.NET `Controller` — it's the public API surface
> but contains no real logic. All business logic lives in the services it calls.

The `App` struct's exported methods (`DashSave`, `GetScreenStatus`, etc.) are automatically
exposed to the TypeScript frontend via Wails code generation. They are defined across
several files for organisation:
- `app.go` — lifecycle, version, window controls
- `app_dashboard.go` — layout management
- `app_hardware.go` — screen/device configuration

---

## The Lifecycle

Wails calls three lifecycle methods in order:

### 1. `Startup(ctx)` — Create services (like constructor/ConfigureServices)

```go
func (a *App) Startup(ctx context.Context) {
    a.ctx = ctx
    log := logger.Init(logger.DefaultConfig())
    a.dash = dashboard.NewManager()          // layout repository
    a.devMgr = devices.NewManager()          // device registry
    a.coord = core.New(log, a.dash, a.devMgr) // coordinator (wires everything)
    a.coord.SetEmit(func(event string, data ...any) {
        runtime.EventsEmit(ctx, event, data...)  // Go → JS event bridge
    })
}
```

Services are created here but **not started**. The reason: if Go emits an event before
React has mounted its listeners, the event is lost. So startup is deferred.

### 2. `DomReady(ctx)` — Start services (like IHostedService.StartAsync)

```go
func (a *App) DomReady(ctx context.Context) {
    a.coord.Start(ctx)          // launches all goroutines
    runtime.EventsEmit(ctx, "app:ready")
}
```

`coord.Start(ctx)` launches three goroutines:
- `go c.screen.Run(ctx)` — USB screen driver loop
- `go c.input.Run(ctx)` — wheel button detector
- `go c.runTelemetryLoop(ctx)` — game adapter reader

All goroutines share the same `ctx`. When the user closes the app, Wails cancels the
context, and all goroutines stop cleanly.

### 3. `Shutdown(ctx)` — Stop services (like IHostedService.StopAsync)

```go
func (a *App) Shutdown(_ context.Context) {
    a.coord.Stop()
}
```

---

## The Coordinator — `app/internal/core/core.go`

> **C# equivalent:** A manually-wired `IHostedService` that orchestrates multiple
> background workers. No DI framework — dependencies are explicit struct fields.

```go
type Coordinator struct {
    logger  *slog.Logger
    adapter games.GameAdapter    // reads frames from the sim game
    screen  hardware.ScreenDriver // sends frames to the USB display
    input   *input.Detector      // detects steering wheel button presses
    devMgr  *devices.Manager     // loads/saves screen device configs
    emit    EmitFn               // Wails event emitter (Go → frontend)

    // State
    connected       bool
    activePageIndex int
    currentLayout   *dashboard.DashLayout
    idleState       bool
}
```

### Constructor: `core.New()`

```go
func New(logger *slog.Logger, dashMgr *dashboard.Manager, devMgr *devices.Manager) *Coordinator {
    // 1. Create the correct screen driver based on saved device config
    driverType := devices.DriverVoCore
    if active := devices.ActiveScreen(reg); active != nil {
        driverType = active.Driver  // "vocore" or "usbd480"
    }
    screen, _ := hardware.NewDriver(driverType, logger)

    // 2. Configure it with saved VID/PID/rotation
    screen.Configure(toHardwareScreenConfig(cfg))

    // 3. Load and apply the saved dash layout
    screen.SetLayout(savedLayout)

    // 4. Wire up button commands
    commands.Handle(dashboard.CmdNextDashPage, func(_ any) { c.CyclePage(+1) })
    commands.Handle(dashboard.CmdPrevDashPage, func(_ any) { c.CyclePage(-1) })
}
```

> **No `new()` keyword, no DI container.** Go uses plain constructor functions.
> Dependencies are passed explicitly — this is the idiomatic Go approach.

---

## The Telemetry Loop — The Hot Path

This is the core data flow at runtime, running at ~60 Hz:

```
Sim Game
  │  (UDP packets / shared memory)
  ▼
GameAdapter.Connect() + Read()
  │  (dto.TelemetryFrame struct)
  ▼
Coordinator.readLoop()
  ├── screen.OnFrame(frame)     → queued for next USB render tick
  ├── updateIdleState(frame)    → detects in-car vs. garage
  └── emit("telemetry:frame")   → React frontend updates UI
```

The telemetry loop in code:

```go
func (c *Coordinator) runTelemetryLoop(ctx context.Context) {
    for {
        c.adapter.Connect()              // blocks until game is running
        c.connected = true
        c.emit("telemetry:connected")

        c.readLoop(ctx)                  // reads until game stops

        c.connected = false
        c.emit("telemetry:disconnected")
        time.Sleep(reconnectDelay)       // wait before retrying
    }
}
```

> **C# equivalent:** This is a `while(true)` loop in a `Task.Run()` background thread,
> with `CancellationToken` passed to the inner read loop. In Go: a goroutine + `ctx`.

---

## Subsystems

### `hardware` — USB Screen Driver

Drives the physical display in the steering wheel over USB at ~30 fps.

```
Coordinator.screen.OnFrame(frame)    ← called at ~60 Hz
       ↓ atomic store
ScreenDriver.driveLoop() ticker      ← fires at 30 Hz
       ↓ dashboard.Painter.Paint()
    image.RGBA                       ← 2D rendered frame
       ↓ applyRGB565Rotation()
    []byte (RGB565)                  ← pixel format the screen understands
       ↓ transport.send()
    USB bulk transfer (WinUSB)       ← bytes to the physical device
```

See `docs/HARDWARE_ABSTRACTION.md` for the full driver design.

### `dashboard` — Layout & Rendering

Manages named dash layouts (stored as JSON files) and renders widgets onto a canvas.

- `Manager` — reads/writes `data/layouts/*.json` (repository pattern)
- `Painter` — owns the active `*gg.Context` canvas, calls widgets to draw
- `widgets/` — ~15 widget types registered via `init()`

See `docs/DASHBOARD_SYSTEM.md` for the full rendering design.

### `devices` — Screen Device Registry

Persists which physical screens are configured and which dash layout is assigned to each.

```go
type SavedScreen struct {
    VID      uint16      // USB Vendor ID  (e.g. 0xC872 for VoCore)
    PID      uint16      // USB Product ID (identifies screen model)
    Driver   DriverType  // "vocore" or "usbd480"
    DashID   string      // which layout to show on this screen
    Rotation int         // 0, 90, 180, or 270 degrees
    Bindings []DeviceBinding // button number → command name
}
```

> **C# equivalent:** A simple JSON file repository (`IRepository<SavedScreen>`).
> No database — the registry is a single `devices.json` in the app data directory.

### `input` — Wheel Button Detector

Reads the steering wheel as a Windows gamepad (DirectInput/XInput) and dispatches
commands when configured buttons are pressed.

```
Physical button press
  ↓ Windows gamepad API
input.Detector.Run()
  ↓ maps button number → commands.Command
commands.Dispatch("dash:next-page")
  ↓ registered handler
Coordinator.CyclePage(+1)
  ↓
screen.SetActivePage(newIndex)
```

### `commands` — Button-to-Action Registry

A thin global registry mapping `Command` strings to handler functions:

```go
commands.Handle(dashboard.CmdNextDashPage, func(_ any) {
    coordinator.CyclePage(+1)
})

// When a button is pressed:
commands.Dispatch(commands.Command("dash:next-page"), nil)
```

> **C# equivalent:** A simplified `MediatR` — command name → single handler function.
> No interfaces, no DI, no generics. One command, one handler.

### `appdata` — Config Directory

Resolves the platform-correct data directory:
- Windows: `%APPDATA%\Sprint\`
- macOS: `~/Library/Application Support/Sprint/`

```go
dir := appdata.Dir()  // returns the correct path for the current OS
```

### `logger` — Structured Logging

Wraps Go's standard `log/slog` with a startup configuration:

```go
log := logger.Init(logger.DefaultConfig())
screenLog := log.With("component", "screen")  // tagged child logger
```

> **C# equivalent:** `ILogger<T>` from `Microsoft.Extensions.Logging`,
> but without the generic type parameter ceremony. Structured JSON output to a log file.

---

## Event System: Go → Frontend

The frontend doesn't poll the backend — the backend pushes events via `runtime.EventsEmit`:

```go
// Go (coordinator) emits:
c.emit("telemetry:connected")
c.emit("telemetry:frame", frame)
c.emit("screen:connected")
c.emit("dash:page-changed", map[string]any{"pageIndex": 1, "pageName": "Race"})
```

```typescript
// TypeScript (React) listens:
import { EventsOn } from '../wailsjs/runtime'

EventsOn('telemetry:frame', (frame: TelemetryFrame) => {
    setFrame(frame)
})
```

> **C# equivalent:** This is SignalR `IHubContext.Clients.All.SendAsync()` but without
> a network connection — it's an in-process IPC bridge. React is the "client", Go is the "hub".

### All events emitted by the backend

| Event | Payload | Meaning |
|---|---|---|
| `app:ready` | — | Wails DOM ready, all subsystems started |
| `telemetry:connected` | — | Game adapter connected |
| `telemetry:disconnected` | — | Game stopped or crashed |
| `telemetry:frame` | `TelemetryFrame` | New telemetry data |
| `screen:connected` | — | USB screen found and opened |
| `screen:disconnected` | — | USB screen disconnected |
| `screen:error` | `string` | USB error message |
| `screen:paused` | — | Screen rendering paused (SimHub takeover) |
| `screen:resumed` | — | Screen rendering resumed |
| `dash:page-changed` | `{pageIndex, pageName}` | Active dash page switched |

---

## Calling Go from TypeScript

Any exported method on the `App` struct is callable from TypeScript:

```go
// Go: app_hardware.go
func (a *App) GetScreenStatus() string {
    return a.coord.GetScreenStatus()  // "connected" or "disconnected"
}
```

```typescript
// TypeScript: wailsjs/go/main/App.ts (auto-generated)
import { GetScreenStatus } from '../wailsjs/go/main/App'

const status = await GetScreenStatus()
```

Wails serialises Go structs to JSON automatically. The TypeScript mirrors in
`packages/types/` keep the type definitions in sync manually.

---

## Dependency Flow (No DI Framework)

Unlike C#'s `IServiceCollection`, this project wires dependencies explicitly:

```
main.go
  └── NewApp(version)
        └── Startup()
              ├── logger.Init()
              ├── dashboard.NewManager()    → dir: %APPDATA%\Sprint\layouts\
              ├── devices.NewManager()      → file: %APPDATA%\Sprint\devices.json
              └── core.New(log, dash, dev)
                    ├── hardware.NewDriver(driverType, log) → ScreenDriver
                    ├── lemansultimate.New()                → GameAdapter
                    └── input.NewDetector(log)              → Detector
```

There is no reflection, no attribute-based injection, no service locator. Every dependency
is a concrete struct field or interface variable passed down through constructors.

> **Why no DI framework?** Go's interface system means any concrete type automatically
> satisfies an interface without registration. The explicit wiring makes the dependency
> graph 100% visible in `core.New()`. For a codebase this size, it's cleaner than a DI
> container.

---

## `internal/` — Package Visibility

Go enforces that packages inside `internal/` can only be imported by their parent module:

```
app/internal/hardware/   ← importable only by code in app/
api/internal/store/      ← importable only by code in api/
```

This is Go's equivalent of C#'s `internal` access modifier, but at the package level rather
than the class level. It prevents accidental coupling between the desktop app and API server.
