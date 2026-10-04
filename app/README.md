# Desktop App (`/app`)

The driver's-rig desktop app: a headless **.NET 10** native host paired with an
**Electron + React** UI (`app/desktop`). The host reads live telemetry, drives USB
screens, and owns all native/platform logic; the Electron app renders the shared
`packages/dashboard` component to the screen, to the editor preview, and offscreen
for USB output, and hosts the Home / Session Planner / Analysis / Dashes / Devices
/ Setups / Race Engineer / Settings / Help shell.

> Read [`docs/internals/overview.md`](../docs/internals/overview.md) before
> changing `app/`: why the Electron/Core/Host split looks the way it does.

## Solution & module boundaries

`app/Sprint.Desktop.slnx` is a self-contained .NET solution. The project
references enforce the seams — respect them:

| Project | Owns | Must NOT contain |
|---|---|---|
| **`Sprint.Desktop.Api`** | The shared contract: `TelemetryFrame` + sub-states, `ITelemetrySource` (lifecycle + health), `TelemetryStatus`/`TelemetryConnectionState`/`TelemetryFreshness`, and the `Engineer/` command/event/staged-change shapes. | Game paths, shared-memory names, binary layouts, parser quirks, **or any UI type**. |
| **`Sprint.Games`** | Telemetry adapters — the **only** place that knows game paths/shm names/structs/parsers. `DemoTelemetrySource` (dev/test) + the LMU adapter. References `Api` only. | UI types, persistence, anything `Core`/`Host`-specific. |
| **`Sprint.Desktop.Core`** | All native desktop logic and no UI framework: runtime persistence, the telemetry engine, session planning, analysis, the dash layout model, devices, hardware/USB, input, diagnostics, and updates. References `Api` + `Games`. | Any UI framework — Core stays headless. |
| **`Sprint.Desktop.Host`** | The HTTP adapter: `Program.cs` exposes `/api/state`, `/api/commands`, frame intake, traces, diagnostics logs, and update checks over loopback HTTP with a per-launch bearer token. Input validation lives at this boundary and in `RuntimeCoordinator`. | Native business logic (belongs in `Core`) or UI. |
| **`Sprint.Desktop.Tests`** | xunit regression suite at stable seams: contracts, runtime persistence, LMU parsing/mapping/source, telemetry engine, dash layout model, hardware fakes/RGB565, input binding, updates, session planning, analysis. References `Core`, `Api`, `Games`. `Sprint.Desktop.Host/Tests` separately covers the command surface and screen outputs. | — |

`app/desktop` is a separate pnpm package (not part of the .NET solution): the
Electron main process (window, frameless title bar, native-host lifetime, one
offscreen browser per active dash output) plus a Vite/React renderer. It owns
presentation only — views render state and raise intent via `send(command)`; all
state arrives through one subscription in `App.tsx`, and `app/desktop/src/bridge.ts`
is the renderer's only data access.

### Inside `Sprint.Desktop.Core`

```
Sprint.Desktop.Core/
├── DesktopRuntime.cs        ← app-data persistence (settings/devices/layouts/setup/controls)
├── RuntimeCoordinator.cs    ← the validated command surface the UI drives; the host serves it
├── DesktopState.cs          ← in-process live state the host publishes to /api/state
├── Runtime/                 ← AppSettings, RenderProfile, BuildInfo (version/channel)
├── Shell/                   ← AppView, ShellState, SurfaceState (shared failure/empty states), ShellCommandRegistry
└── Features/
    ├── Live/                 ← TelemetryEngine (bg reader + reconnect + rate/delta), presenters
    ├── Dashes/                ← dash layout model, editor controller, validator, widget catalog, binding resolver, alert tracker
    ├── Hardware/              ← Rgb565, IScreenDriver + FakeScreenDriver, ScreenPublisher, WinUSB VoCore/USBD480 drivers, desktop-capture + offscreen-frame plumbing
    ├── Input/                 ← CommandBus, InputBinding + store, WindowsRawInputSource
    ├── Engineer/              ← EngineerStageService (staged-change diff via the Api contract), models
    ├── Setup/                 ← setup programs, snapshot capture/association, SetupComparison (A/B predicted delta)
    ├── Devices/               ← device catalog/saved-device models
    ├── SessionPlanning/       ← session plans, lap history/trace stores, results import
    ├── Analysis/              ← lap corpus browsing/filtering for the Analysis view
    ├── Charts/                ← chart scale/series/panel models shared by Analysis
    ├── LiveCompare/           ← live-compare HUD controller and window plan
    ├── Sharing/               ← shared-lap import/export and the Sprint cloud client
    ├── Diagnostics/           ← FileLogger, CrashReporter, LiveLogStore (see docs/operations/diagnostics.md)
    ├── Notifications/         ← toast timeline, system-animation preference
    ├── Development/           ← dev/test game-state override
    └── Updates/               ← UpdateChecker (channel-aware semver), GitHubReleaseSource, UpdateInstaller
```

## Development environment

- **SDK: .NET `10.0.301`**, pinned by the repo-root `global.json` (`rollForward:
  latestMinor`). Shared MSBuild props live in `app/Directory.Build.props`.
- **SDK gotcha (Windows):** the 10.x SDK is installed under the **x86** host
  `C:\Program Files (x86)\dotnet`. The x64 `dotnet` on `PATH` may only carry an
  older runtime and report "no SDK found". Invoke the x86 host explicitly:

  ```powershell
  & 'C:\Program Files (x86)\dotnet\dotnet.exe' build app/Sprint.Desktop.slnx
  ```

  `make` targets work wherever the correct SDK resolves, on Windows and macOS;
  CI installs it via `global.json`. Dev `run`/`watch` stay framework-dependent
  (fast); a shipping **publish** is self-contained and RID-specific (this
  machine's RID by default, e.g. `win-x64` or `osx-arm64`; override with
  `RID=linux-x64`) — see [`docs/operations/release.md`](../docs/operations/release.md).
- **macOS:** builds, tests and runs, without game telemetry or USB screens —
  see [`docs/operations/development.md`](../docs/operations/development.md#developing-on-macos).
- Node ≥ 20 and `pnpm install` are required for `app/desktop`, `packages/dashboard`,
  and `packages/tokens`, which the desktop app depends on.

## Commands

```sh
# Restore / build (the real gate is -warnaserror)
dotnet restore app/Sprint.Desktop.slnx
make lint-app                      # = dotnet build app/Sprint.Desktop.slnx -warnaserror
                                    #   + pnpm type-check for @sprint/dashboard and @sprint/desktop

# Run the app (demo telemetry by default; a running game drives the LMU source)
make dev-app                       # = pnpm --filter @sprint/desktop dev (Vite + Electron + native host)
make dev-host                      # = dotnet watch --project app/Sprint.Desktop.Host (host only, no UI)

# Tests
make test-app                      # = dotnet test (Sprint.Desktop.Tests + Sprint.Desktop.Host/Tests)
                                    #   + pnpm test for @sprint/dashboard and @sprint/desktop

# Publish + package → app/build/bin
make build-app [VERSION=1.2.3]     # = dotnet publish the host (self-contained, -r <this machine's RID>)
                                    #   into app/desktop/resources/host, then pnpm build + pnpm package
```

## Testing

Tests sit at **stable, behaviour-oriented seams** so implementation can change
without rewriting the suite: pure presenters/reducers (dash layout model + editor
controller, RGB565, command/binding, engineer staging, update checker, surface
state), persistence against **temp dirs** (never real AppData), and hardware/input
verified against fakes (`FakeScreenDriver`, keyboard-fallback capture) rather than
physical devices. `Sprint.Desktop.Host/Tests` separately exercises the command
surface and screen outputs at the HTTP boundary. `packages/dashboard` and
`app/desktop` carry their own TypeScript suites (`pnpm --filter @sprint/dashboard
test`, `pnpm --filter @sprint/desktop test`); `make test-app` runs all four
together.

## Adding a game (desktop)

Games are added entirely within the native layer:

1. Implement `ITelemetrySource` (from `Sprint.Desktop.Api`) in **`Sprint.Games`**,
   mapping the game's shared memory / structs to `TelemetryFrame`. Keep all
   game-specific knowledge here.
2. Implement `IGameProvider` (in `Sprint.Desktop.Api/Games`) and register it in
   `GameProviders`. `Descriptor` and `CreateTelemetrySource()` are required; the
   `Results`, `Setups` and `Schedule` capabilities are optional and return `null`
   when the game cannot do them, so discovery is a null check.
3. `GameProviders.Default` — the first registered real game, never the dev
   simulation — is what `Sprint.Desktop.Host/Program.cs` starts on automatically;
   a new provider needs no other wiring. The telemetry engine, dash renderer,
   engineer surfaces, and hardware pipeline consume the shared contract and need
   no changes.

## Hardware & input caveats

The VoCore/USBD480 WinUSB drivers and Windows Raw Input capture
(`Sprint.Desktop.Core/Features/Hardware`, `Features/Input`) are Windows-only
P/Invoke; elsewhere screens report `Unsupported` and input capture is a no-op.
Everything they plug into — RGB565 conversion, the screen publisher, and the
command/binding model — is verified in the test suite against fake adapters
(`FakeScreenDriver`) and keyboard-fallback capture rather than physical hardware.

## Pointers

- [`docs/README.md`](../docs/README.md) — index of internals and runbooks.
- [`docs/internals/overview.md`](../docs/internals/overview.md) — architecture and the reasons behind it.
- [`docs/design/DESIGN.md`](../docs/design/DESIGN.md) — UI rules; the wheel dash rules are in
  [`docs/internals/dash-rendering.md`](../docs/internals/dash-rendering.md).
- [`docs/internals/screen-protocols.md`](../docs/internals/screen-protocols.md) — WinUSB / VoCore / USBD480 / RGB565.
- [`docs/operations/release.md`](../docs/operations/release.md) — packaging, versions, channels, updates.
- [`.agents/skills/test-sprint-desktop`](../.agents/skills/test-sprint-desktop/SKILL.md) — how to verify desktop UI.
