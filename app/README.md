# Desktop App (`/app`)

Native **.NET 10 / Avalonia** desktop app for the driver's rig — the successor to
the retired Go/Wails + React desktop. It reads live telemetry, renders the on-wheel
dash, drives USB screens, and hosts the Live / Engineer / Setup / Dashes / Devices /
Settings / Help shell.

> **Source of truth for status:** `docs/MIGRATION_INVENTORY.md` (§0 has the
> reconciled per-workstream state and the tracked deferrals). Read it before
> changing `app/`.

## Solution & module boundaries

`app/Sprint.Desktop.slnx` is a self-contained .NET solution (four projects). The
project references enforce the seams — respect them:

| Project | Owns | Must NOT contain |
|---|---|---|
| **`Sprint.Desktop.Api`** | The shared contract: `TelemetryFrame` + sub-states, `ITelemetrySource` (lifecycle + health), `TelemetryStatus`/`TelemetryConnectionState`/`TelemetryFreshness`, and the `Engineer/` command/event/staged-change shapes. | Game paths, shared-memory names, binary layouts, parser quirks, **or any Avalonia/UI type**. |
| **`Sprint.Games`** | Telemetry adapters — the **only** place that knows game paths/shm names/structs/parsers. `DemoTelemetrySource` (dev/test) + the LMU adapter. References `Api` only. | UI types, persistence, anything `Client`-specific. |
| **`Sprint.Desktop.Client`** | Avalonia shell, all feature pages, the SkiaSharp dash painter + editor, hardware pipeline, input/command binding, runtime persistence, and the `Graphite` design layer. References `Api` + `Games`. | Game data formats (blocked by project refs). |
| **`Sprint.Desktop.Tests`** | xunit regression suite at stable seams (+ `Avalonia.Headless` shell/visual tests). References all three. | — |

### Inside `Sprint.Desktop.Client`

```
Sprint.Desktop.Client/
├── CompositionRoot.cs      ← explicit DI root: builds runtime/shell/source, injects MainWindow
├── MainWindow.cs           ← the shell (titlebar, nav, per-page composition)
├── DesktopRuntime.cs        ← app-data persistence (settings/devices/layouts/setup/controls)
├── Graphite.cs             ← design tokens + reusable control factories (StatePanel, StatusPill, …)
├── Runtime/                ← AppSettings, RenderProfile, BuildInfo (version/channel)
├── Shell/                  ← ShellState, AppView, WindowDragPolicy, SurfaceState (shared failure/empty states)
├── Assets/ · presets/      ← bundled fonts (Inter + Space Grotesk), brand assets, JSON presets
└── Features/
    ├── Live/               ← TelemetryEngine (bg reader + reconnect + rate/delta), presenters
    ├── Dashes/             ← DashPainter (SkiaSharp), DashImageRenderer bridge, editor (controller + view), layout model/reducers/validator, alert tracker
    ├── Hardware/           ← Rgb565, IScreenDriver + FakeScreenDriver, ScreenPublisher, DeviceScreenService, WinUSB VoCore/USBD480 drivers + factory
    ├── Input/              ← CommandBus, InputBinding + store, BindingResolver, InputCaptureReducer
    ├── Engineer/           ← EngineerStageService (staged-change diff via the Api contract), models
    ├── Setup/              ← setup programs + SetupComparison (A/B predicted delta)
    ├── Devices/            ← device catalog/saved-device models
    └── Updates/            ← UpdateChecker (channel-aware semver) + GitHubReleaseSource
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

  `make` targets work wherever the correct SDK resolves; CI installs it via
  `global.json`. Publish is **Windows-first** (`RuntimeIdentifiers=win-x64`,
  framework-dependent — flip `SelfContained` for a standalone build).

## Commands

```powershell
# Restore / build (the real gate is -warnaserror)
dotnet restore app/Sprint.Desktop.slnx
make lint-app                      # = dotnet build app/Sprint.Desktop.slnx -warnaserror

# Run the shell (demo telemetry by default; a running game drives the LMU source)
make dev-app                       # = dotnet run --project app/Sprint.Desktop.Client/...

# Tests (xunit)
make test-app                      # = dotnet test app/Sprint.Desktop.Tests/...
dotnet test app/Sprint.Desktop.Tests/Sprint.Desktop.Tests.csproj --filter VisualSmokeTests

# Publish → app/build/bin
make build-app [VERSION=1.2.3]     # = dotnet publish -c Release -r win-x64 -o app/build/bin
```

## Testing

Tests sit at **stable, behaviour-oriented seams** so implementation can change
without rewriting the suite: pure presenters/reducers (dash render plan + editor
controller, RGB565, command/binding/capture, engineer staging, update checker,
surface state), persistence against **temp dirs** (never real AppData), and
`Avalonia.Headless` tests that build/show/capture the shell and dash editor. Use
`Avalonia.Headless` + `HeadlessUnitTestSession` directly — the `.Headless.XUnit`
package targets xunit v3 and collides with this suite's v2.

## Adding a game (desktop)

Games are added entirely within the desktop solution:

1. Implement `ITelemetrySource` (from `Sprint.Desktop.Api`) in **`Sprint.Games`**,
   mapping the game's shared memory / structs to `TelemetryFrame`. Keep all
   game-specific knowledge here.
2. Add a `GameDescriptor` and wire it into `GameTelemetryPackage.CreateSource`.
3. Select it in `CompositionRoot.CreateMainWindow` (a per-launch game-picker UI is
   a follow-up). The engine, dash painter, hardware pipeline, and UI consume the
   shared contract and need no other changes.

## Hardware & input caveats

The VoCore/USBD480 WinUSB drivers and Windows Raw Input capture are Windows-only
P/Invoke and are **structurally complete but hardware-unverified** (they need a
physical device / joystick — see inventory Open Questions #3/#4). Everything they
plug into (RGB565 conversion, the screen publisher/coordinator, the command/binding
model) is verified with fake adapters + keyboard-fallback capture.

## Pointers

- `docs/MIGRATION_INVENTORY.md` — parity matrix + reconciled status (read first).
- `docs/DESIGN.md` — the Graphite design contract (canonical UI system).
- `docs/DESKTOP_SMOKE.md` — the manual launch/telemetry/dash/devices smoke script.
- `docs/SCREEN_PROTOCOLS.md` — WinUSB / VoCore / USBD480 / RGB565 protocol reference.
- `docs/RELEASE.md` — publishing, version/channel reporting, and the updater decision.
