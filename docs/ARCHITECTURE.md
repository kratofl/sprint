# Sprint — Architecture Decision Record

> Committed snapshot of the backend/runtime architecture. Keep it current when
> the service wiring or data flow changes.

## Project: Sim Racing Telemetry Platform

### Stack Overview

| Component | Path | Stack |
|---|---|---|
| Desktop app | `/app` | Wails v2 (Go backend + embedded React/TS frontend) |
| API server | `/api` | Go `net/http` |
| Web app | `/web` | Next.js 16 App Router |
| Shared Go | `/pkg` | Go modules (dto, games) |
| Shared TS | `/packages` | pnpm workspace (@sprint/ui, @sprint/types, @sprint/tokens) |

**Primary focus: `/app` (desktop).** Do not touch `/api` or `/web` unless explicitly asked.

---

## Data Flow (Runtime)

```
Sim Game (UDP/shared memory)
  → GameAdapter.Read() → *dto.TelemetryFrame
  → Coordinator (30 Hz throttle)
      ├→ hardware.ScreenDriver.OnFrame() → painter.Paint() → RGB565 → WinUSB → screen
      └→ runtime.EventsEmit() → React frontend (via dedicated goroutine, buffered ch 1)
```

---

## Desktop App Architecture

### Entry Points
- `app/main.go` — Wails bootstrap, injects `-ldflags -X main.Version=...`
- `app/app.go` — `App` struct (thin binding layer); lifecycle: `Startup → DomReady → Shutdown`
- `app/app_dashboard.go`, `app/app_hardware.go` — additional bindings

### Lifecycle Rule
**Create services in `Startup()`, start goroutines in `DomReady()`** — if goroutines emit events before React mounts listeners, events are lost.

### Coordinator (`app/internal/core/core.go`)
Central service host. Constructor-injected. Manages a `map[string]*deviceEntry` (one entry per registered screen device). Goroutines started in `DomReady`:
- One `hardware.ScreenDriver.Run(ctx)` per registered screen device
- `go c.input.Run(ctx)` — wheel button detection
- `go c.runTelemetryLoop(ctx)` — game data reader
- One frontend-emitter goroutine reads from `frontendEmitCh` (buffered 1, latest-value semantics) to decouple Wails IPC latency from the read loop

### Internal Packages
```
app/internal/
  core/          ← coordinator: wires all subsystems; no business logic
  hardware/      ← ScreenDriver interface, VoCoreDriver, USBD480Driver, baseDriver, factory
  dashboard/     ← DashLayout model, Manager (JSON repo), Painter, widgets/, alerts/, config/
  devices/       ← device registry persistence; DeviceType, DevicePurpose, DriverType, CatalogEntry
  input/         ← wheel button Detector; maps button numbers to command strings
  delta/         ← position-based lap delta Tracker + Store; ReferenceLap; valid-lap detection
  commands/      ← global button→action registry: Handle(cmd, fn) + Dispatch(cmd, payload)
  capture/       ← Windows GDI screen capture (rear-view feature) + transparent overlay window
  updater/       ← GitHub Releases checker + one-click self-replace installer (Windows)
  settings/      ← persistent app preferences (settings.json); update channel
  logger/        ← slog wrapper; Init() + multi-writer (file + console)
  appdata/       ← platform config dir resolver (%APPDATA%\Sprint\ on Windows)
```

---

## Hardware Abstraction

### ScreenDriver Interface (`app/internal/hardware/driver.go`)
Both VoCoreDriver and USBD480Driver embed `baseDriver` and only override `Run()`.

**baseDriver** uses `atomic.Pointer[T]` and `atomic.Bool` for all hot-path state (latest frame, rotation, layout, idle state) — no mutexes on the 30 Hz render path.

**Double-buffer pipeline**: 3 pre-allocated RGB565 buffers cycle between render goroutine and USB sender goroutine to prevent render blocking on USB latency.

**Multi-device support**: coordinator holds one `*deviceEntry` per registered device; each has its own driver goroutine, page index, and layout.

**DevicePurpose**: `PurposeDash` (shows telemetry dashboard) or `PurposeRearView` (shows screen capture from PC).

### VoCore M-PRO Protocol
- VID: `0xC872`, Bulk OUT EP: `0x02`
- Vendor control request: `0xB0`
- Wake: send `{0x00, 0x29, ...}` (quit sleep) then `0x51` brightness=255
- Frame: send Memory Write cmd (`0x2C`) then bulk RGB565 data
- **NEVER send `0x10`/`0x11` (raw MIPI DCS)** — confuses firmware state machine
- Ref "disable" = brightness=0, NOT hardware sleep → always restore with `0x29` + `0x51`
- Model auto-detected via B5/B6/B7 query sequence

### USBD480 Protocol
- VID: `0x16C0`, PID: `0x08A7`
- Composite device: Interface 0 = display (WinUSB), Interface 1 = HID touchscreen
- **Always install WinUSB on whole-device** (not per-interface) — OUT vendor control transfers fail with per-interface install
- Frame: `SET_ADDRESS(0)` → bulk RGB565 → `SET_FRAME_START_ADDRESS(0)`
- No sleep/wake command — brightness restore (`0x81`) is sufficient
- `bmRequestType`: OUT=`0x40`, IN=`0xC0` (RECIP_DEVICE). Using RECIP_INTERFACE (0x41/0xC1) causes USB STALL

### Screen Rotation
Stored as `atomic.Int32`. Handled in RGBA→RGB565 conversion. Canvas dimensions swap for 90°/270°.

### Pause Mode (Ref coexistence)
`SetPaused(true)` → `driveLoop` exits, releases USB handle. Outer `runLoop` waits. `SetPaused(false)` → reconnects immediately.

---

## Dashboard System

### Data Model
- `DashLayout` (ID, Name, Pages, IdlePage, AlertConfig) → stored as `%APPDATA%\Sprint\layouts\<uuid>\config.json`
- `DashPage` → `[]DashWidget` (Type, Col, Row, ColSpan, RowSpan, Config map)
- Default layout embedded via `//go:embed default.json`
- Alerts: `alerts/` package handles full-screen overlays on TC/ABS/EngineMap changes

### Rendering Pipeline
`TelemetryFrame → painter.Paint() → image.RGBA → applyRGB565Rotation() → []byte → USB bulk transfer`

### Widget Registry
Widgets self-register via `func init()` in `app/internal/dashboard/widgets/widget_<name>.go`. Import `_ "...widgets"` in `painter.go` triggers all inits. No other files need changing to add a widget.

`WidgetCtx` helpers: `Panel()`, `FontNumber()`, `FontLabel()`, `CX()`, `FmtSpeed()`, `FmtLap()`, `ConfigString()`

---

## Telemetry DTO (`pkg/dto/`)

**`TelemetryFrame`** fields: Timestamp, Session (type/track), Car (throttle/brake/clutch 0–1, steering -1 to 1, gear -1 to 8, speedMS), Tires[4] (FL/FR/RL/RR, temps °C, pressures kPa), Lap (current/best/last times, sectors), Flags (yellow/SC/trackLimits).

**SI units throughout**: m/s, °C, kPa. Zero = valid value (stationary, not unknown).

TypeScript mirrors in `packages/types/src/telemetry.ts` kept in sync manually.

---

## GameAdapter Interface (`pkg/games/adapter.go`)

```go
type GameAdapter interface {
    Name() string
    Connect() error    // safe to call multiple times
    Disconnect() error
    Read() (*dto.TelemetryFrame, error)  // blocks until frame ready
}
```

Reference implementation: `pkg/games/lemansultimate/`. Register in `app/internal/core/core.go`.

---

## Delta Tracking (`app/internal/delta/`)

`Tracker.Process(frame)` — called on every telemetry frame. Accumulates `Sample{Pos, T}` points during each lap. On lap completion, builds a `ReferenceLap` (500 evenly-spaced position points). Delta computed via position-based linear interpolation, smoothed with EMA (alpha=0.2, ~50 ms time constant).

Valid-lap detection lives here: `lastValidLap` is updated when a completed lap passes all validity checks (not out/in, no yellow/SC, no track limits, within ±5% of session best). `SetManualReference()` selects it as the current delta reference.

---

## Valid Lap Criteria (wheel "set target" button)
Must satisfy ALL: not out/in lap, no yellow flag or SC, no track limits violation, lap time within ±5% of session best.

---

## Wails Events (Go → Frontend)

| Event | Payload |
|---|---|
| `app:ready` | — |
| `telemetry:connected` / `:disconnected` | — |
| `telemetry:frame` | `TelemetryFrame` |
| `screen:connected` / `:disconnected` / `:error` / `:paused` / `:resumed` | string (error only) |
| `dash:page-changed` | `{pageIndex, pageName}` |

Frontend listens via `EventsOn(eventName, callback)`. Backend calls via `runtime.EventsEmit(ctx, name, data...)` wrapped in `EmitFn` closure set at startup.

---

## Config Storage
```
%APPDATA%\Sprint\
  layouts\<uuid>\config.json     ← DashLayout
  layouts\<uuid>\thumbnail.png   ← auto-generated preview
  devices.json                   ← screen device registry (VID/PID/driver/purpose/dashID/rotation/bindings)
  settings.json                  ← app preferences (update channel, etc.)
```

---

## TypeScript / React Conventions

- **Design tokens**: `@sprint/tokens` (globals.css, Tailwind config)
- **Shared components**: `@sprint/ui` — primitives/ (Button, Badge, Card) + telemetry/ (LapTime, DeltaBar, TireTemp)
- **CVA + cn()** for variants; Radix Slot for `asChild`
- **Orange `#ff906c`** = driver/primary; **Cyan `#5af8fb`** = engineer/comparison
- Surface utilities: `.surface`, `.surface-elevated`, `.surface-overlay`, `.surface-active`, `.surface-secondary`
- Fonts: `Space Grotesk` (UI), `JetBrains Mono` (data/telemetry, `font-mono tabular-nums`)
- Desktop-only components in `app/frontend/src/components/` (Wails API deps)
- Both apps' Tailwind `content` includes `packages/ui/src/**`

---

## Go Conventions

- No DI framework — explicit constructor injection
- `internal/` enforces package visibility
- `atomic.Pointer[T]` / `atomic.Bool` for hot-path shared state (render tick reads)
- `log/slog` throughout; child loggers with `logger.With("component", "name")`
- Build tags for platform-specific code: `_windows.go`, `_linux.go`, `_darwin.go`
- Every `.go` file has exactly ONE `package` declaration
- `any` instead of `interface{}`

---

## Available Skills (invoke via skill tool)

| Skill | When to use |
|---|---|
| `telemetry-data-pipeline` | Implementing game adapters, modifying DTOs, telemetry processing |
| `vocore-screen` | Touching `app/internal/hardware/vocore_*.go` |
| `usbd480-screen` | Touching `app/internal/hardware/usbd480_*.go` |
| `web-coder` | Web standards, HTTP, frontend platform questions |
| `multi-stage-dockerfile` | Docker build work |
| `architecture-blueprint-generator` | Generating architectural docs |
| `code-review` | Reviewing PRs or diffs |

## Available Prompts (use as agent context)

| Prompt | Purpose |
|---|---|
| `.github/prompts/new-game-adapter.md` | Scaffold new game adapter |
| `.github/prompts/new-shared-component.md` | Create shared UI component in @sprint/ui |
| `.github/prompts/new-api-endpoint.md` | Add API endpoint |
| `.github/prompts/maintenance.md` | Maintenance/housekeeping tasks |
