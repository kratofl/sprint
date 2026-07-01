# Sprint Desktop .NET Migration Inventory

> **Canonical parity checklist** for migrating the Sprint desktop app from the
> retired Wails (Go backend + React frontend) stack to the new
> **.NET 10 / Avalonia** solution under `app/`. This is the single source future
> agents plan from — it enumerates every old capability, its new status, the
> owning PRD workstream, priority, and acceptance-criteria pointer.

## Purpose

PRD #107 (user stories 7, 42, 44) asks for one durable, explicit parity document
so that:

- **US7** — every old Wails/app-frontend desktop capability is enumerated with a
  migrated / deferred / dropped status.
- **US42** — large scopes (the 11 workstreams) are recorded with their acceptance
  criteria as durable context, so future agents do not re-discover architectural
  intent.
- **US44** — intentionally deferred items live in one tracked location so
  incomplete work is never mistaken for done.

## How to use this checklist

1. Find the feature you are about to work on in **[The Parity Matrix](#4-the-parity-matrix)**.
2. Read its **Owning Workstream** row and jump to that workstream section for goal,
   acceptance criteria, owned rows, and explicit deferrals.
3. Treat **Status** literally: `Done` = behavior parity verified; `Partial` = a
   skeleton exists but drops fidelity / persistence / threading; `Missing` = no
   .NET implementation yet; `Stub`/`Placeholder` = declarative only (constants /
   no-op).
4. When you complete a row, flip its status here in the same PR and reconcile the
   relevant workstream's DEFERRED list. Do not delete deferred rows — annotate
   them as resolved.
5. Priorities: **P0** = required for a usable real-telemetry desktop app
   (contract, LMU adapter, persistence, dash render, shell stability); **P1** =
   feature parity users will notice missing (hardware output, input binding,
   editor depth, packaging); **P2** = nice-to-have / dev-gated / lower-traffic.

> **Build verification (updated 2026-06-29):** the .NET **10.0.301** SDK is
> installed under the **x86** host `C:\Program Files (x86)\dotnet` (the x64
> `dotnet` on PATH carries only a 6.0.5 runtime — which is why `dotnet --version`
> first appeared to fail). `dotnet build app/Sprint.Desktop.sln -warnaserror`
> **succeeds clean (0/0)** and `dotnet test` **passes 25/25** (up from 4 — WS3 added
> contract/freshness/presenter/rate tests + a **headless Avalonia shell test** that
> builds/shows/closes `MainWindow` under a real Avalonia context). `global.json`
> pins the SDK (WS2). View *construction* is now headless-verified; full *visual*
> behavior still needs a `make dev-app` GUI run. Use the x86 host explicitly — the
> x64 `dotnet` on PATH lists no 10.x SDK, so a bare `dotnet`/`make` only works where
> the x86 host resolves (CI installs the SDK via `global.json`).

---

## 1. Header context: the migration at a glance

| Old stack | New stack |
| --- | --- |
| Wails desktop (Go backend) | .NET 10 + Avalonia 12.0.5 (Desktop + Fluent) |
| Embedded React/Vite frontend (`app/frontend`, `//go:embed frontend/dist`) | Imperative Avalonia C# (`Sprint.Desktop.Client`), MVVM/presenter seams to be introduced |
| Go shared-memory + WinUSB + Raw Input | .NET interop (shared-memory, WinUSB, joystick) — **largely unported** |
| `pkg/dto` Go telemetry spine | `Sprint.Desktop.Api` `TelemetryFrame` contract |
| Go embedded TTFs + `gg` painter | Dash painter port strategy **open** (see risks) |

The old Vite `frontend/` tree still physically sits in `app/` but is **not** part
of `Sprint.Desktop.sln`. WS1 owns purging stale Wails / `frontend/dist` / embed
references from docs, comments, `Makefile`, and tooling.

---

## 2. Architecture target

### The four modules and their ownership boundaries (per PRD WS2/WS3)

| Module | Project | Owns | Must NOT contain |
| --- | --- | --- | --- |
| **Api** | `Sprint.Desktop.Api` | The shared contract: telemetry frames, session/car/input/flags/timing/controls state, **adapter health + disconnected/stale/invalid states**, engineer commands + staged car-control changes. | Game-specific paths, shared-memory names, binary layouts, parser quirks, **or any Avalonia/UI types** (enforced by project refs + review). |
| **Games** | `Sprint.Games` | Telemetry adapters. The **only** place that knows LMU paths, shared-memory names, binary structs, parser logic. Demo source as dev/test only. References `Api` only. | UI types; persistence; anything `Client`-specific. |
| **Client** | `Sprint.Desktop.Client` | Avalonia shell, all 7 pages, dash render + editor, devices/settings/help UI, runtime persistence, reusable Graphite controls. References `Api` + `Games`. | Game data formats (seam enforced by project references — US3). |
| **Tests** | `Sprint.Desktop.Tests` | Regression harness at stable seams (runtime/presenter/contract/adapter/fake-hardware). References all 3 app projects. | — |

**Composition-root rule (WS2):** use DI / explicit composition roots where modules
need dependencies; **no service-locator or hidden-singleton wiring**. Today
`MainWindow` is the de-facto composition root (news up `DesktopRuntime`,
`ShellState`, demo source directly) — that is the principal structural seam to
break up.

### Design contract summary (Graphite flat system, `docs/DESIGN.md`)

> **NOTE — palette is canonical; typography now matches the Figma (resolved
> 2026-06-29).** `Graphite.cs` implements `docs/DESIGN.md`: surfaces
> `#070707/#0D0D0D/#131313/#1B1B1B`, accent `#FF6A00` (the `Primary` button tone),
> `#4F9CFF` *informational*, status `#16B566/#F5483D/#F5C518`, radius 10, 40px
> titlebar. The maintainer confirmed the UI must match `docs/Sprint.fig`, whose
> typography is **Inter** (UI) + **Space Grotesk** (display/brand) — so the design
> layer was migrated off `IBM Plex Sans`: both fonts are now bundled under
> `Sprint.Desktop.Client/Assets/Fonts` and exposed via `Graphite.FontStack` /
> `Graphite.DisplayFontStack`, with `docs/DESIGN.md` updated to match
> (build-verified). There is **no palette contradiction** (the "Graphite RETIRED"
> framing belongs only to the separate `feat/figma-flat-ui-theme` branch).
> Remaining design work is structural — reusable templated controls + full Figma
> component fidelity, render-verified on a GUI run (WS6).

Design intent that is uncontested regardless of which palette wins:

- Flat, layered, near-black, dense, calm, precise. Depth from a `bg → panel →
  panel2 → panel3` surface step + 1px hairline border. **No** gradients, glass
  blur, glow, or neumorphic effects. Shadows reserved for modals, alert popups,
  the canvas stage.
- Single warm accent for active/primary/focus/selection.
- `font-variant-numeric: tabular-nums` globally; large telemetry values heavier
  weight + tabular figures, no viewport scaling.
- **Build recurring patterns once** as reusable Avalonia controls
  (UserControl/TemplatedControl) with centralized themes/resources; feature slices
  **compose** them — never scatter one-off colors/borders/spacing.
- Reusable control families to build once: NavRail/Tabs, segmented controls,
  status pills, metric tiles/cards, device cards, settings/binding rows, dash
  widget frames, toolbar/icon buttons, Input/Select/Switch/Stepper,
  Badge/KeyChip/Tooltip, PageHeader, Modal/ConfirmDialog/Toast.
- Explicit shared state visuals: empty / loading / disconnected / stale /
  unsupported / permission-denied / device-busy / invalid-frame / retrying.
- Accessibility: visible focus on every keyboard-operable control, focus not
  obscured by overlays, semantic headings/landmarks, predictable tab order, Enter/
  Space activate + Escape cancels modal/listen/selection, accessible names on
  icon-only controls, stable layout under text changes.
- **Governance:** do not hardcode raw hex outside the centralized token layer; do
  not revive retired non-flat directions; keep Avalonia controls aligned to the
  same tokens/interaction contracts as `packages/ui`.

---

## 3. New .NET skeleton status snapshot

### Solution & project files

| Item | Status | Detail |
| --- | --- | --- |
| `Sprint.Desktop.sln` | implemented | VS2017-format; Debug/Release × Any CPU/x64/x86, but every x64/x86 maps `ActiveCfg` back to Any CPU (no real per-RID build). |
| `Sprint.Desktop.Client.csproj` | implemented | net10.0 WinExe, Nullable+ImplicitUsings, Avalonia.Desktop + Themes.Fluent 12.0.5; refs Api+Games; packs Assets/presets/appicon; lock file present. **No RID / PublishSingleFile / Trimming.** |
| `Sprint.Desktop.Api.csproj` | implemented | net10.0 classlib, no deps, no project refs — pure contract assembly; lock file present. |
| `Sprint.Games.csproj` | implemented | net10.0 classlib referencing Api only; lock file present. |
| `Sprint.Desktop.Tests.csproj` | implemented (WS2; headless added WS3) | net10.0 **xunit** project (Microsoft.NET.Test.Sdk 18.7.0 + xunit 2.9.3 + runner 3.1.5) **+ Avalonia.Headless 12.0.5**. `dotnet test` runs 25 facts. **NB:** `Avalonia.Headless.XUnit` was rejected — it targets xunit v3 and collides with v2; the harness drives `HeadlessUnitTestSession` directly. Refs all 3 app projects; lock file present. |
| SDK pinning / build infra | implemented (WS2, 2026-06-29) | `global.json` pins SDK **10.0.301** (rollForward latestMinor); `app/Directory.Build.props` centralizes LangVersion/Nullable/ImplicitUsings/Deterministic + version metadata. Build verified 0/0 incl. `-warnaserror`. |
| RID / publish targeting | **missing** | No `RuntimeIdentifier` despite Windows-first WinUSB ambitions; no publish profile enforcing `app/build/bin`. |

### Api contract

| Item | Status | Detail |
| --- | --- | --- |
| `ITelemetrySource` | implemented (redesigned WS3, 2026-06-29) | Synchronous pull reader **with lifecycle + health**: `Name`, `Status`, `Current`, `Connect()`, `Disconnect()`, `TryRead(out)`, `: IDisposable`. Doc-contract pins: never-throw on recoverable failure (reflect in `Status`), idempotent/reusable Connect/Disconnect, terminal Dispose (post-dispose Connect/TryRead throw `ObjectDisposedException`), `TryRead` is the single mutation point (false = no-new-frame, non-null last-known out), atomic-publish for off-thread (WS4) impls. **The background loop / reconnect / buffered handoff is intentionally NOT on the adapter — that is the WS4 engine.** |
| TelemetryFrame timing/lap | implemented | `LapState`: current/last/best/target lap, Delta, Sector, IsValid, TrackPosition; `SessionInfo`: SessionTime/BestLapTime/MaxLaps. |
| TelemetryFrame flags | implemented | `RaceFlags`: yellow, double-yellow, red, safety car, VSC, checkered. |
| TelemetryFrame inputs/controls | implemented | `CarState` throttle/brake/clutch/steering + gear/rpm/maxRpm/brakeBiasRear; `ElectronicsState` TC(+active)/ABS/MotorMap (+max) + DrsActive. |
| TelemetryFrame fuel/energy | implemented | `CarState` FuelLiters/FuelPerLapLiters; `EnergyState` VirtualEnergy/StateOfCharge/Regen/Deploy. |
| TelemetryFrame tyres | implemented | `TireState` per corner: inner/mid/outer/surface/core temps, pressure kPa, wear%, compound; 4 corners by `TirePosition`. |
| TelemetryFrame session/race/penalties | implemented | `SessionInfo`/`RaceState`(position/total/gapAhead/gapBehind)/`PenaltiesState`(incidents/trackLimitSteps/pitStops). |
| Stale/invalid/health signalling | implemented (WS3, 2026-06-29) | `TelemetryConnectionState` (Disconnected/Connecting/WaitingForGame/Connected/Stale/Unsupported/PermissionDenied/Faulted) + `TelemetryStatus` (SourceName/Detail/LastFrameAt/**LastFrameValid+InvalidReason**/IsLive) + pure clock-injected `TelemetryFreshness.Evaluate` (the only place a live link is downgraded to Stale). Frame-validity is separate from link-state so a link can be Connected+invalid-frame. The faked "SIM DEMO / 60Hz / green dot" is **gone** — titlebar + Live pill render real status via `TelemetryStatusPresenter`. (UpdateRateHz is deliberately NOT on the contract; the Client `RateMeter` measures it.) |
| Engineer command/event contract | implemented (WS3, 2026-06-29) | `Sprint.Desktop.Api/Engineer/EngineerContract.cs`: `EngineerCommand`/`EngineerEvent` + `SetTargetLapPayload`/`NotePayload` + `StagedControlChange`, faithfully mirroring `pkg/dto/engineer.go` / `packages/types/src/engineer.ts` with pinned JSON names + snake_case enum discriminators. **Pure shapes only** — polymorphic Payload (de)serialization + transport + Engineer-page wiring are WS9. |

### Client runtime & shell

| Item | Status | Detail |
| --- | --- | --- |
| App / Program (composition root) | implemented (WS2, 2026-06-29) | `AppBuilder.Configure<App>().UsePlatformDetect()`, STAThread classic-desktop; Dark FluentTheme. **Explicit composition root** (`CompositionRoot.CreateMainWindow()`) now builds `DesktopRuntime`/`ShellState`/`ITelemetrySource` and injects them — no hidden `new()` inside the window. (No DI container; explicit root is sufficient at this size.) |
| MainWindow shell (~990 lines) | implemented (monolithic) | Custom 40px titlebar, collapsible nav, **all 7 pages + every widget builder inline**; rebuilds whole control tree on each `RenderBody()`. No MVVM/XAML/view separation. **Deps now constructor-injected (WS2)**; per-page/view-model decomposition still TODO (WS6). |
| Live page | implemented (demo only) | Metric tiles, pedal bars, tyre temps, hardcoded polyline track map; bound to demo snapshot; refreshes every 500ms. |
| Engineer page | implemented (session-only) | Stepper rows w/ staged-vs-car diff, dirty badge, Push/Revert wired to runtime, quick-messages, radio log (in-memory cap 8). |
| Setup page | partial | 3 baseline programs + 14 grouped params + Duplicate; setup programs now persist to `setup-programs.json`; `fuelLoad` grouped under Fuel. |
| Dashes page | partial | Lists layouts, Create (clones default JSON), Delete (guards default/last); preview tiles now use `DashPreviewRenderer` render plans for grid bounds + resolved telemetry/profile bindings. Model preserves idlePage/alerts/widget config, but the preview still renders labeled boxes rather than full widget visuals. |
| Devices page | implemented | Catalog add, saved-device cards w/ Enable/Disable/Remove; add/remove persist to `devices.json`. **Disable is session-only.** |
| Settings page | partial | Driver name/number + update channel combo; Save writes `settings.json`. `dashEditorUI` and NewDashDefaults now round-trip; `SaveSettings()` publishes the current render profile for downstream re-apply. |
| Help page | implemented | Six static reference cards. |
| `DesktopRuntime` (461 lines) | implemented | App-data persistence: loads presets w/ fallbacks, persists settings/devices/per-layout JSON under `%AppData%/Sprint` (overridable dataRoot/presetRoot for tests). Clean, no UI deps. |
| `ShellState` | implemented | POCO: AppView + sidebar collapsed/width (208/62) + CurrentTitle map. **No INotifyPropertyChanged.** |
| `WindowDragPolicy` | implemented | Pure, unit-tested; blocks drag on Button/TextBox/ComboBox/Slider/ScrollBar/Thumb/SelectingItemsControl. |
| Graphite design system (`Graphite.cs`) | implemented (matches `docs/DESIGN.md`) | Palette (`#070707`/`#0D0D0D`/`#131313`/`#1B1B1B`, accent `#FF6A00`, `#4F9CFF` informational), radius 10, 40px titlebar match `docs/DESIGN.md`. **Typography migrated to the Figma identity:** `FontStack`=Inter, `DisplayFontStack`=Space Grotesk, fonts bundled under `Assets/Fonts` (build-verified). Remaining gap is structural — factory methods, not templated controls (WS6). |
| `AppSettings` model | partial | updateChannel/driverName/driverNumber + `dashEditorUI` palette/inspector state + NewDashDefaults. `RenderProfile` exposes driver name/number for dash bindings. |
| Feature models (Dash/Device/Engineer/Live/Setup) | partial | Dash models preserve idlePage/alerts/widget config; catalog/saved devices preserve offset_x/offset_y/margin/bindings. Broader dash widget/theme/config types still incomplete for WS6. |
| `LiveTelemetryPresenter` / `TelemetrySnapshot` | implemented | The one real presenter seam: static pure mapper frame→flat snapshot (m/s→kph, lap format, per-corner surface temp). Unit-tested. Covers a subset (no flags/electronics/energy/penalties/session). |
| `TelemetryStatusPresenter` / `RateMeter` | implemented (WS3, 2026-06-29) | Pure, unit-tested Client seams: `TelemetryStatusPresenter.ToView(status, hz, now)` maps health→{Label, RateText, Tone} (applies freshness; flags invalid-frame on a live link); `RateMeter` measures real Hz via EMA (clock-injected). MainWindow connects-on-load, disposes-on-close, resets the meter when not live, and renders both from real `Status`. The WS4 background-reader engine reuses `RateMeter`. |

### Games

| Item | Status | Detail |
| --- | --- | --- |
| `DemoTelemetrySource` | implemented | Deterministic sine/`Random(14)` simulator; the **only** working `ITelemetrySource`. internal sealed, via factory. |
| `GameDescriptor` | implemented | Record (Id, Name, Transport, Available) for the supported-games list. |
| `GameTelemetryPackage` | partial | Exposes `SupportedGames` (LMU + demo) + `CreateDemoSource()`. **No `CreateSource(descriptor)` factory** — registry advertises LMU it cannot instantiate. |
| LeMansUltimate adapter | **placeholder** | `LeMansUltimateGameData` = constants only (LMU_Data, MaxVehicles 104, OS paths) + a Descriptor reporting Available on Windows. **No ITelemetrySource, no shared-memory reader, no mapping.** |

### Tests

| Item | Status | Detail |
| --- | --- | --- |
| Test runner | implemented (WS2, 2026-06-29) | Migrated from the hand-rolled console runner to **xunit** + `dotnet test`; `make test-app` and CI now run `dotnet test`. Verified 4/4 + clean `-warnaserror`. |
| Tested seams | partial (broadened WS3/WS5/WS6) | xunit desktop suite includes runtime device/settings/dash/setup persistence, contract/freshness/presenter/rate tests, LMU parser/mapper/engine tests, dash catalog/binding/render-plan tests, headless shell lifecycle, and visual smoke PNG capture. **Still uncovered:** full painter-backed dash render/editor behavior, hardware, input binding, live LMU GUI run. |

### Assets & presets

| Item | Status | Detail |
| --- | --- | --- |
| `presets/dash/default.json` | partial | Rich: 20×12 grid, idlePage, 9 typed widgets, alerts[]. C# model preserves idlePage/alerts/widget config; `DashPreviewRenderer` can plan bounds + bindings for the known subset, but painter/editor visuals still use only a subset. |
| `presets/devices/*.json` (3) | implemented | generic-vocore, generic-usbd480, bavarian-omega-v2-pro; load into Catalog. offset_x/offset_y/margin/bindings present in JSON but **not modeled**. |
| `presets/settings/default.json` | partial | Has updateChannel + dashEditorUI{palette,inspector}; both now round-trip. Dash editor UI behavior still pending WS6. |
| Assets/Brand + appicon | implemented | appicon.png loaded as WindowIcon; brand SVGs/wallpaper packaged but **not referenced** by UI code. |

---

## 4. THE PARITY MATRIX

Status legend: **Done** (behavior parity) · **Partial** (skeleton exists, drops
fidelity/persistence/threading) · **Missing** (no .NET impl) · **Stub/Placeholder**
(declarative only). AC pointer = `WS<n>` workstream + the user story it satisfies.

### 4.1 Shell / UI / Navigation

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| App lifecycle (Startup/DomReady/Shutdown), deferred subsystem start | `app/app.go`, `main.go`, `embedded.go` | Partial | WS2 | P0 | WS2/US8 | .NET news up MainWindow directly; no DI; no DomReady-equivalent gating beyond timer. |
| Boot gating on `app:ready` + splash | React `App.tsx`, `SplashScreen.tsx` | Missing | WS11 | P2 | WS11/US41 | No splash overlay / ready event in .NET. |
| Frameless window + custom titlebar controls (min/max/close) | `app.go` (WindowMinimise/Maximise/Close), `WindowControls.tsx` | Done | WS11 | P0 | WS11/US11,US12 | .NET has 40px titlebar + drag + min/max/close (40px matches `docs/DESIGN.md` shell spec). Click-crash safety is US12 — verify titlebar button handlers cannot throw on click. |
| Window drag policy (chrome vs drag region) | `shellHeader.tsx` (app-region) | Done | WS11 | P0 | WS11/US12 | `WindowDragPolicy` pure + unit-tested. |
| Nav rail w/ grouped sections + collapse | `App.tsx`, `appShell.ts`, `SidebarBrand.tsx` | Partial | WS2/WS6 | P1 | WS6/US26 | `ShellState` holds collapse/width (208/62) but no INotifyPropertyChanged; MainWindow manual rebuild. Needs reusable NavRail control. |
| View history (back/forward) + unsaved-changes guard | `App.tsx` (createViewHistory), `DashEditorHandle` | Missing | WS6 | P2 | WS6/US27 | No history stack or dirty-guard ConfirmDialog in .NET. |
| Keyboard nav shortcuts (Ctrl+, Alt+1..9) | `App.tsx` | Missing | WS11 | P2 | WS11/accessibility | Accessibility contract item. |
| Single content header w/ per-view portal slot | `shellHeader.tsx`, `ViewHeader`/`HeaderPortal` | Missing | WS6 | P2 | WS6/US26 | .NET rebuilds whole tree; no portal slot abstraction. |
| Home section switcher (Live/Engineer/Setup) | React `Home.tsx` (SegmentedControl) | Partial | WS6 | P1 | WS6/US26 | .NET exposes pages but as nav, not a segmented sub-surface; compact mode absent. |
| Help static reference | `Help.tsx` | Done | WS6 | P2 | WS6/US26 | Six static cards present in .NET. |
| Reusable Graphite control families (NavRail/Tabs/pills/tiles/cards/rows/frames/dialogs/inputs) | `packages/ui`, React composites | Missing | WS6 | P1 | WS6/design addendum | Design addendum: build once, compose. `Graphite.cs` only has factory methods, not templated controls/themes; palette already matches `docs/DESIGN.md`. |
| Shared state visuals (empty/loading/disconnected/stale/unsupported/permission-denied/device-busy/invalid-frame/retrying) | React per-view empty/error states | Missing | WS11 | P1 | WS11/US14,US17,US33 | Must be modeled as shared controls, not re-invented per slice. |
| Splash overlay (staged status + fade) | `SplashScreen.tsx` | Missing | WS11 | P2 | WS11/US41 | Purely presentational; low priority. |
| Update-available toast | `UpdateToast.tsx`, `useUpdateCheck.ts` | Missing | WS10 | P2 | WS10/US40 | Depends on updater port decision. |

### 4.2 Telemetry contract & live data

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Unified telemetry DTO (the spine, SI units) | `pkg/dto/telemetry.go` | Partial | WS3 | P0 | WS3/US5 | `TelemetryFrame` covers timing/lap/flags/inputs/fuel/energy/tyres/session/race/penalties. Parity-critical contract. |
| Adapter health + disconnected/stale/invalid states | (Go: events `telemetry:connected/disconnected`, `ErrNotRunning`) | **Done** | WS3 | P0 | WS3/US5,US14,US18 | `TelemetryConnectionState`+`TelemetryStatus`+`TelemetryFreshness` (Api); honest titlebar/Live pill via `TelemetryStatusPresenter` (Client). `WaitingForGame`=`ErrNotRunning` analogue, `PermissionDenied`, `Faulted` catch-all. Unblocks WS4/WS11. (Source emitting these states end-to-end is WS4 — the demo is a healthy-link simulator.) |
| Engineer commands + staged car-control changes in shared contract | `pkg/dto/engineer.go` (EngineerCommand/Event) | **Done (shapes)** | WS3 | P1 | WS3/US19,US20 | `Api/Engineer/EngineerContract.cs` mirrors the Go/TS source (pinned JSON names + snake_case enums) + adds `StagedControlChange`. **Shapes only** — transport, polymorphic Payload decode, and Engineer-page wiring are WS9 (gate WS9 on these landing). |
| Decoupled ~30Hz frontend emitter (buffered latest-value handoff) | `core/core.go` runFrontendEmitter | **Done** | WS4 | P0 | WS4/US13 | `Features/Live/TelemetryEngine.cs`: background reader fills a volatile `EngineSnapshot` (atomic ref swap of a class record); MainWindow drains it on a 33ms DispatcherTimer. Real measured Hz replaces the faked "60Hz". |
| Telemetry fan-out + delta augmentation (non-mutating) | `core/core.go` readLoop/augmentDelta/fanOut | **Done** | WS4 | P1 | WS4/US15,US16 | `Features/Live/DeltaTracker.cs` injects Delta + TargetLapTime via a record `with`-copy (never mutates the adapter frame); engine holds the last augmented frame across no-frame ticks so delta doesn't flicker to 0. |
| Game adapter probe & reconnect loop (5s retry, idle on disconnect) | `core/core.go` runTelemetryLoop | **Done** | WS4 | P0 | WS4/US17 | `TelemetryEngine` reader thread: Connect→read while live; 5s reconnect/probe idle on a dropped/Waiting/Faulted link; never-crash (Step self-publishes Faulted on any unexpected throw). |
| Idle state management (InCar flip, snap to page 0, reset stacks) | `core/core.go` updateIdleState | Partial | WS4/WS6 | P1 | WS6/US25 | `Session.InCar` flows through the frame and gates DeltaTracker; the page-snap-to-0 / stack-reset is WS6 (dash pages not ported yet). |
| Live telemetry view grid (car/lap/sectors/trackmap/tyres/fuel) | React `Telemetry.tsx`, `useTelemetry.ts` | Partial | WS6 | P1 | WS6/US29 | .NET Live page renders subset from demo snapshot; capacity/bestSector unwired. |
| Empty/waiting states (connected-vs-offline distinction) | `Telemetry.tsx` | Missing | WS11 | P1 | WS11/US14 | Tied to health-state contract gap. |
| `IsConnected` probe (init connection state) | `app.go` IsConnected | Missing | WS3 | P1 | WS3/US14 | Was used so the indicator is correct if events fired pre-mount. |
| LiveTelemetryPresenter (frame→snapshot mapper) | (new) `LiveTelemetryPresenter` | Done | WS6 | P1 | WS6/testing | Unit-tested; only covers subset of frame. Extend coverage as widgets land. |

### 4.3 Game adapters

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `GameAdapter` interface (Name/Connect/Disconnect/Read) | `pkg/games/adapter.go` | **Done (interface)** | WS3 | P0 | WS3/US15 | `ITelemetrySource` redesigned WS3: Name/Status/Current/Connect/Disconnect/TryRead : IDisposable — the sync-pull reader half of the old `GameAdapter`. The async background loop/reconnect (the old `core` half) is WS4's engine, not the adapter. WS4 builds LMU against this shape (no further contract redesign expected). |
| Le Mans Ultimate adapter (LMU_Data shm, ~100Hz, struct decode → frame) | `pkg/games/lemansultimate/adapter.go`, `structs.go` | **Done** | WS4 | P0 | WS4/US15,US16 | `LeMansUltimateTelemetrySource` (+ `LmuParser`/`LmuTelemetryMapper`): synchronous memcpy+decode→frame, maps shm/decode failures to WaitingForGame/PermissionDenied/Unsupported/Faulted. Driven end-to-end through `TelemetryEngine` over a synthetic `InMemoryLmuSnapshotProvider` in tests; live GUI verification still pending a running game. |
| LMU binary struct layout (`_pack_=4` mirror) | `lemansultimate/structs.go` | **Done** | WS4 | P0 | WS4/US16 | `LmuBinary` + `LmuModels` mirror the SharedMemoryInterface layout; offsets pinned by tests. |
| Cross-platform shared-memory reader (Win OpenFileMapping / Linux /dev/shm) | `pkg/shm/*.go` | **Done (Windows)** | WS4 | P0 | WS4/US15 | `WindowsLmuSharedMemoryProvider` (MemoryMappedFile.OpenExisting) + `InMemoryLmuSnapshotProvider` (tests). Linux `/dev/shm` still deferred (best-effort). |
| `CreateSource(descriptor)` factory | (gap) `GameTelemetryPackage` | **Done** | WS4 | P0 | WS4/US15 | `GameTelemetryPackage.CreateSource(descriptor)` instantiates LMU or demo by id; unknown id throws. CompositionRoot still defaults to demo (game-selection UI is a follow-up). |
| Demo telemetry source (dev/test only) | (new) `DemoTelemetrySource` | Done | WS4 | P2 | WS4/US15 | Keep as dev/test adapter; **not** real-game parity. |
| Engineer contract DTO (commands/events) | `pkg/dto/engineer.go` | Missing | WS9 | P2 | WS9/US19,US20 | No active desktop consumer in old surface; contract only. |

### 4.4 Runtime persistence

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Portable app-data dir (`data/` next to exe, fallback UserConfigDir) | `app/internal/appdata/appdata.go` | Partial | WS5 | P1 | WS5/US21 | .NET uses `%AppData%/Sprint` (dataRoot/presetRoot overridable for tests). Portability semantics differ — confirm intent. |
| App settings persistence (channel/driver/NewDashDefaults/dashEditorUI) | `app/internal/settings/settings.go` | Partial | WS5 | P0 | WS5/US21 | channel/driver, `dashEditorUI`, and NewDashDefaults now round-trip and migrate from legacy settings. |
| Settings get/save + re-apply render profile | `app/app.go` GetSettings/SaveSettings | Partial | WS5 | P1 | WS5/US21 | Save writes settings.json and publishes `RenderProfileChanged`; full renderer/hardware consumption comes with WS6/WS7 render pipeline wiring. |
| Device registry persistence (wheels/screens/buttonboxes split JSON) | `app/internal/devices/manager.go` | Partial | WS5 | P0 | WS5/US22 | .NET persists `devices.json` (single file) with offset/margin/bindings, composite driver-vid-pid-serial IDs, and persisted update setters. Per-type split remains intentionally different unless portable-mode decision changes it. |
| Dash layout persistence (`data/layouts/<id>/config.json` + thumbnail) | `dashboard/manager.go` | Partial | WS5 | P0 | WS5/US23 | .NET writes per-layout JSON, exposes `IDesktopRuntime.SaveDashLayout` for editor changes, preserves idlePage/alerts/widget config, and generates a 320×192 layout thumbnail PNG. Full painter-backed thumbnails remain WS6. |
| EnsureDefault / seed embedded default | `dashboard/manager.go` | Partial | WS5 | P1 | WS5/US23 | Create clones default JSON; richer seeding (built-in protection, SetDefault flag flip) partial. |
| Setup program persistence | (none in old; new) Setup page | Done | WS5 | P1 | WS5/persistence | Setup programs persist to `setup-programs.json`; duplicate and stepper edits save immediately. |
| One-time migration of old local data | (Go custom UnmarshalJSON migrations) | Partial | WS5 | P1 | WS5/US24 | Old portable `data/settings.json`, `data/devices/{wheels,screens,buttonboxes}.json`, and `data/layouts/<id>/config.json` migrate once into the new store. |
| Centralized persistence interface | (new) `DesktopRuntime` + `IDesktopRuntime` | Partial | WS5 | P1 | WS5/persistence | `MainWindow` now depends on `IDesktopRuntime` for settings/devices/layouts/setup/migrations, including explicit layout save after editor mutations. Further split into storage services can wait until WS6/WS7 need narrower seams. |

### 4.5 Dash rendering + editor

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Frame rendering pipeline (Paint active/idle page) | `dashboard/painter.go` | **Missing** | WS6 | P0 | WS6/US25 | Go `gg`-based painter. Port strategy open (see risks). The default preset must render accurately. |
| Grid-to-pixel widget dispatch (auto panel/label, throttle, capability-gate, panel rules) | `painter.go` dispatchWidget | Missing | WS6 | P0 | WS6/US28 | |
| Update-rate throttle cache (per-widget sub-context) | `painter_cache.go` | Missing | WS6 | P2 | WS6/US28 | Perf optimization; defer until base render works. |
| Reusable context + pre-baked background (fixed black canvas) | `painter.go` ensureBg/getContext | Missing | WS6 | P1 | WS6/US25 | Canvas bg fixed `#000000` per on-wheel contract. |
| Element renderers (Panel/Text/Dot/Bar/DeltaBar/SegBar/Grid/Condition/Badge) | `painter_draw.go` | Missing | WS6 | P0 | WS6/US29 | |
| Auto text stacking + optical centering | `painter_draw.go` | Missing | WS6 | P1 | WS6/US28 | |
| Three-layer theme resolution (default→preset/global→layout override) | `painter.go`, `theme_overrides.go` | Missing | WS6 | P1 | WS6/US26 | |
| Widget-stack layer state (active layer per page/stack) | `painter.go` SetWidgetStackLayer | Missing | WS6 | P1 | WS6/US27 | |
| Font extraction & caching (Saira values / Inter labels + fallbacks) | `painter_fonts.go`, `fonts/*.ttf` | Missing | WS6 | P1 | WS6/US25 | Embedded TTFs. Avalonia font-loading strategy needed. |
| Alert overlays (priority order, normal/inverted, full/centered) | `painter_overlays.go`, alerts pkg | Missing | WS6 | P1 | WS6/US29 | |
| Flag overlay (RED FLAG/SAFETY CAR/YELLOW banner + tint) | `painter_overlays.go` | Missing | WS6 | P1 | WS6/US29 | |
| Theme preset library (6 built-ins + user presets, `dash_themes.json`) | `themes.go` | Missing | WS6 | P1 | WS6/US26 | Built-ins read-only/protected. |
| Inherited override clearing | `theme_overrides.go` | Missing | WS6 | P2 | WS6/US26 | |
| Global setters + ApplyRenderPreferences broadcast | `painter.go`, `core.go` | Missing | WS6 | P1 | WS6/US26 | Single authoritative RenderPreferences bundle. |
| Layout schema (grid + IdlePage + Pages[] + WidgetStacks + per-layout theme/format/alerts) | `dashboard/layout.go` | Partial | WS6 | P0 | WS6/US26 | .NET `DashLayout` reads id/name/default/grid/idlePage/pages.widgets/alerts and preserves widget config; widget stacks, layout theme, format preferences, and validation still missing. |
| Backwards-compatible layout migration (wrapperGroups→stacks, variants→layers) | `dashboard/layout.go` UnmarshalJSON | Missing | WS6 | P2 | WS6/US24 | |
| Layout validation (bounds/overlap/layer rules) as save gate | `dashboard/layout.go` ValidateLayout; React `layoutValidation.ts` | Partial | WS6 | P0 | WS6/US28 | .NET validates known widget types, grid bounds, and same-page widget overlap on load/migration/save. Layer/stack-specific validation remains pending with widget stacks. |
| Widget/layout preview rendering (single widget + thumbnail PNG) | `dashboard/painter.go` RenderWidgetPreview/renderPreview | Partial | WS6 | P1 | WS6/US25 | Runtime now generates basic grid/widget layout thumbnail PNGs on save. Painter-backed widget previews and content-accurate thumbnails are still missing. |
| Editor live preview pipeline (StartPreview/UpdatePreview/StopPreview, base64 PNG @30Hz) | `core/preview.go`, `app.go` Dash*Preview | Missing | WS6 | P1 | WS6/US27 | Debounced 150ms in React. |
| Dash list grid (cards, preview thumbnails, badges) | React `DashList.tsx` | Partial | WS6 | P1 | WS6/US26 | .NET lists + grid-math preview; no server PNG, no rich badges. |
| Editor mode router (list/edit/global-settings/theme-edit) | React `DashEditor.tsx`, `dashEditorRuntime.ts` | Partial | WS6 | P1 | WS6/US27 | .NET has create/delete/set-default; no global-settings/theme-edit surfaces. |
| Three-pane editor shell (rail/canvas/properties + toolbar) | `DashEditMode.tsx` | Missing | WS6 | P1 | WS6/US27 | |
| Grid drag-place/move/resize + live ghost + clamp math | `DashCanvas.tsx`, `canvasDragMath.ts` | Missing | WS6 | P0 | WS6/US27,US28 | |
| Pages + idle page management (locked Idle/Alerts tabs, add/rename/delete) | `DashEditMode.tsx` PageTabs | Partial | WS6 | P1 | WS6/US27 | `DashLayoutEditor.AddPage`, `TryRenamePage`, and `TryDeletePage` provide tested regular-page reducers with unique ids/names and last-page protection; `IDesktopRuntime.SaveDashLayout` persists reducer output. The Dashes card has a headless-tested Add page action for custom layouts. Full page-tab UI, locked Idle/Alerts behavior, active-page state, rename/delete page UI, and full editor save wiring still missing. |
| Selection/delete/page-background/clear-page | `DashEditMode.tsx` | Partial | WS6 | P2 | WS6/US27 | `DashLayoutEditor.TryDeleteWidget` and `TryClearPage` provide tested page-scoped reducers; `IDesktopRuntime.SaveDashLayout` persists reducer output. Selection state, page-background editing, toolbar UI, and UI save wiring still missing. |
| Editor widget move/resize reducers (grid clamp + overlap guard) | `DashEditMode.tsx` drag/resize state | Partial | WS6 | P0 | WS6/US26,US28 | `DashLayoutEditor.TryMoveWidget` and `TryResizeWidget` clamp geometry to grid bounds, enforce minimum widget size, and reject overlaps through pure tested seams; `IDesktopRuntime.SaveDashLayout` persists reducer output. Avalonia drag handles, resize handles, selection UI, and UI save wiring still missing. |
| Catalog-backed widget placement reducer | `WidgetPalette.tsx`, `DashCanvas.tsx` placement | Partial | WS6 | P1 | WS6/US26,US28 | `DashLayoutEditor.TryAddWidget` validates catalog types, creates unique widget ids, and places a default-size widget in the first available grid slot without overlaps. Searchable palette UI, drag ghost, custom default sizes, and config defaults still missing. |
| Widget stacks: create/place/focus-mode/layer list/compare | `multiFunctionWidgetState.ts`, `DashEditMode.tsx` | Missing | WS6 | P1 | WS6/US27 | |
| Searchable categorized widget palette + preview thumbnails | `WidgetPalette.tsx` | Missing | WS6 | P1 | WS6/US26 | |
| Per-widget config inspector (catalog-driven configDefs) | `WidgetProperties.tsx` | Missing | WS6 | P1 | WS6/US27 | |
| Per-widget style overrides (font/size/colors/border) | `WidgetProperties.tsx` (style disclosure) | Missing | WS6 | P2 | WS6/US27 | |
| Theme/domain/typography/format editor | `AdditionalSettingsPanel.tsx` | Missing | WS6 | P2 | WS6/US26 | |
| Theme manager (preset cards + swatch strip + CRUD) | `ThemeManager.tsx` | Missing | WS6 | P2 | WS6/US26 | |
| Theme resolution + legacy migration (frontend) | `themeOverrides.ts`, `defaults.ts` | Missing | WS6 | P2 | WS6/US24,US26 | Migrates retired Graphite/cyan legacy values. |
| Alerts editor (shared settings + per-type toggle catalog) | `AlertsEditor.tsx`, `alertConfig.ts` | Missing | WS6 | P1 | WS6/US29 | |
| Legacy per-instance alert migration | `alertConfig.ts`, Go `alerts.MigrateAlertConfig` | Missing | WS6 | P2 | WS6/US24 | |
| On-wheel widget preview renderer (in-browser HTML/CSS, placeholder data) | `WidgetPreview.tsx`, `widgetPreview/*` | Missing | WS6 | P2 | WS6/US25 | Client-side preview alternative to server PNG. |
| Dash render-plan / live preview model | `dashboard/painter.go`; React preview pipeline | Partial | WS6 | P0 | WS6/US25,US29 | `DashPreviewRenderer` builds a pure render plan with per-widget pixel bounds and resolved catalog bindings, and the Dashes page consumes it for preview tiles. Full painter-backed pixels, themes, formatting, stacks, and hardware frame output remain missing. |
| Widget registry & catalog (23 types, meta, auto config) | `widgets/widget.go`, `bindings.go` | Partial | WS6 | P0 | WS6/US29 | .NET has a small catalog for default/critical widget types (`header`, `text`, `rpm_bar`, `gear_speed`, `input_trace`, `sector`, `lap_time`, `delta`, `fuel`, `tyre_temp`, `flag`, `tc`) with binding metadata; full 23-type catalog/config defs still missing. |
| Telemetry binding resolution (~90 dot-path bindings + derived) | `widgets/bindings.go`, `binding.go` | Partial | WS6 | P0 | WS6/US29 | .NET now resolves critical/default dash bindings across car speed/gear/rpm/fuel, inputs, lap timing/delta/sector, flags, electronics, tyre surface temps, and profile name/number. Full ~90-path resolver + derived binding engine still missing. |
| Value formatting + format preferences (lap/sector/speed/temp/delta/units) | `widgets/format.go`, `format_prefs.go`; React `lib/format.ts` | Partial | WS6 | P1 | WS6/US29 | .NET presenter formats a subset (kph/lap). Full FormatPreferences merge missing. |
| Color palette/theme/domain types + style/color-expression types | `widgets/palette.go`, `theme.go`, `style.go` | Missing | WS6 | P1 | WS6/US26 | |
| Driving/timing/car-settings/race/info widget families (23 types) | `widgets/widget_*.go` | Missing | WS6 | P0 | WS6/US29 | RPM/speed/gear/fuel/lap/delta/flags/tyres/input are explicitly critical (US29). |
| Render profile (DriverName/Number text bindings) | `dashboard/profile.go` | Partial | WS6 | P2 | WS6/US26 | `RenderProfile` + `RenderProfileChanged` expose driver name/number; `DashBindingResolver` resolves `profile.driverName` / `profile.driverNumber`. Painter/editor consumers still pending WS6. |
| Page cycle bridge + dynamic dash-page-cycle commands | `app.go` DashCyclePage; `core.go` ReloadDashCommands | Missing | WS8 | P2 | WS8/US34 | Couples editor (stacks) to input binding. |

### 4.6 Hardware display pipeline

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ScreenDriver interface + factory (VoCore/USBD480) | `hardware/driver.go`, `factory.go` | **Missing** | WS7 | P1 | WS7/US30 | Display-device interface w/ fake (test) + real (Windows) adapters. |
| Base driver render+send loop (connect-retry, double-buffer, FPS, events) | `hardware/base_driver.go` | Missing | WS7 | P1 | WS7/US32 | Hardware I/O must stay off UI thread w/ explicit lifecycle/cancellation. |
| FrameSource auto-management (lazy Painter, external source swap) | `hardware/base_driver.go` | Missing | WS7 | P1 | WS7/US32 | Depends on dash painter port (WS6). |
| Disable/release & reconnect (free USB for other apps) | `hardware/base_driver.go` | Missing | WS7 | P2 | WS7/US31 | .NET Devices "Disable" toggle is currently session-only / no hardware effect. |
| FrameSource / ResizableSource interfaces | `hardware/frame_source.go` | Missing | WS7 | P1 | WS7/US32 | |
| RGB565 conversion w/ rotation/margin/offset (CW90/180/270) | `hardware/rgb565.go` | Missing | WS7 | P1 | WS7/US32 | Was Go-tested (`rgb565_test.go`); port + port tests. |
| VoCore driver + WinUSB bulk transport (VID 0xC872, PID→dims map) | `hardware/vocore_*.go` | Missing | WS7 | P1 | WS7/US30 | WinUSB-in-.NET interop strategy open (see risks). |
| USBD480 driver + WinUSB control/bulk transport (VID 0x16C0 PID 0x08A7) | `hardware/usbd480_*.go` | Missing | WS7 | P1 | WS7/US30 | |
| Device scan (SetupDI Windows / gousb Linux) | `hardware/vocore_scan_*.go`, `usbd480_scan_*.go` | Missing | WS7 | P1 | WS7/US31 | Connection status must be diagnosable. |
| WinUSB driver install (embedded .inf + pnputil + UAC) | `hardware/winusb_install_windows.go`, `winusb/*.inf` | Missing | WS7 | P2 | WS7/US33 | `InstallScreenDriver` bridge; permission-denied state. |
| Screen driver-missing event → install prompt | `hardware/events.go`; React `DriverMissingBanner.tsx` | Missing | WS7 | P2 | WS7/US33 | |
| Hardware/transport failures as UI status (never crash) | base driver events | Missing | WS7 | P1 | WS7/US33 | device-busy / permission-denied / retrying states. |

### 4.7 Input & command binding

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Command bus (RegisterMeta/Handle/Dispatch/Catalog/ReplaceDynamic) | `app/internal/commands/commands.go` | Missing | WS8 | P1 | WS8/US34 | UI-independent command model. |
| Binding config persistence (`controls.json`, global + per-device) | `input/config.go` | Missing | WS8 | P1 | WS8/US36 | Bound commands persist across sessions. |
| Button event dispatch (VID/PID exact then wildcard, route to ScreenID) | `input/detector.go` | Missing | WS8 | P1 | WS8/US34 | |
| Button capture session (listen mode, timeout, encoder ticks) | `input/detector.go` CaptureNextButton | Missing | WS8 | P1 | WS8/US35 | Listen mode ergonomics (US35). |
| Windows Raw Input loop (HidP decode, OS-thread message loop) | `input/joystick_windows.go` | Missing | WS8 | P1 | WS8/US34 | Windows-only; .NET interop. Unavailable-input state must be explicit. |
| Input binding merge & reload (global + per-device → detector) | `core/core.go` ReloadInputBindings | Missing | WS8 | P1 | WS8/US34 | |
| Controls binding bridge (GetCommandCatalog/Get/SaveBindings/CaptureNextButton) | `app/app_controls.go` | Missing | WS8 | P1 | WS8/US34,US35 | |
| Per-device button bindings bridge | `app.go` DeviceGet/SaveDeviceBindings | Missing | WS8 | P2 | WS8/US34 | |
| Bindings tab UI (grouped by command source, active-dash scoped) | React `deviceBindingsViewModel.ts`, `DeviceCommandRow.tsx` | Missing | WS8 | P1 | WS8/US35 | Compose reusable Graphite binding-row control. |
| Listen-to-bind capture UI (physical + keyboard fallback, single-flight) | `deviceBindingListenState.ts` | Missing | WS8 | P1 | WS8/US35 | |
| Binding reference data loading (layouts + catalog, reload on layouts-updated) | `deviceBindingReferenceData.ts` | Missing | WS8 | P2 | WS8/US34 | |
| Standalone command handlers (dash.page.next/prev, dash.target.set) | `core/core.go` | Missing | WS8 | P2 | WS8/US34 | dash.target.set ties to delta SetManualReference. |

### 4.8 Engineer / web / API integration

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Engineer stage/revert/push car electronics | React `Engineer.tsx`; (new) Engineer page | Partial | WS9 | P1 | WS9/US19,US20 | .NET Engineer page interactive but **session-only, not wired to any backend command**. |
| Engineer quick messages + radio log | `Engineer.tsx` | Partial | WS9 | P2 | WS9/US20 | In-memory cap 8 in .NET; not persisted/synced. |
| Shared DTO assumptions updated away from Wails | `pkg/dto`, `packages/types` | Missing | WS9 | P1 | WS9/US37 | Keep desktop/API/web vocabulary accurate. |
| Engineer commands flow through shared contracts (desktop↔web) | `pkg/dto/engineer.go` | Missing | WS9 | P2 | WS9/US19,US20 | Staged changes reviewable before push. |
| Desktop events compatible with wider Sprint API/web | (Wails events) | Missing | WS9 | P2 | WS9/integration | Limited to shared-contract scope; avoid out-of-scope api/web rewrites. |
| Setup programs (list/select/duplicate/delete/baseline) | React `Controls.tsx`, `setupProgramModel.ts`; .NET Setup page | Partial | WS5/WS9 | P1 | WS5/persistence | List/select/duplicate and stepper edits persist locally; delete/baseline management still missing. |
| Setup edit mode (grouped parameter steppers) | `Controls.tsx` SETUP_GROUPS | Partial | WS9 | P2 | WS9/US20 | `fuelLoad` now grouped under Fuel; richer setup edit/compare remains pending. |
| Setup A/B comparison (predicted-laptime delta) | `setupProgramModel.ts` getSetupPrediction | Missing | WS9 | P2 | WS9/US20 | Synthetic prediction; not real telemetry. |

### 4.9 Packaging / release / cross-cutting

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Version & build-channel reporting | `app.go` GetVersion/GetBuildChannel | Missing | WS10 | P1 | WS10/US38 | -ldflags version → MSBuild version metadata. |
| Auto-update check & install (GitHub releases, self-replace) | `app.go`, `updater/*.go` | Missing | WS10 | P2 | WS10/US40 | **Port-or-drop decision required** (see risks/Open Questions). |
| GitHub release check (channel-aware semver) | `updater/updater.go` CheckLatest | Missing | WS10 | P2 | WS10/US40 | |
| Self-replacing install (Windows batch) | `updater/install_windows.go` | Missing | WS10 | P2 | WS10/US40 | |
| Settings update-channel + manual check + version badge | React `Settings.tsx` | Partial | WS10 | P2 | WS10/US40 | .NET has channel combo; no CheckUpdate / version badge. |
| Executable/artifact naming, icons, assets, presets, version metadata | `main.go` window config, `embedded.go` | Partial | WS10 | P1 | WS10/US9,US10,US38 | appicon loaded; brand SVGs shipped but unused; no intentional artifact naming / no RID / no publish profile. |
| Installer / packaging strategy | (Wails build) | Missing | WS10 | P1 | WS10/US39 | No publish profile; sln declares x64/x86 but maps to Any CPU. |
| Signing + version metadata | (none) | Missing | WS10 | P2 | WS10/signing | Intentional + documented. |
| Structured multi-sink logging (daily JSON + stdout, 14-day retention) | `app/internal/logger/*.go` | Missing | WS2 | P2 | WS2/US8 | No .NET logging seam yet. |
| Lap delta tracking: reference store + position tracker + manual reference | `app/internal/delta/*.go` | **Done** | WS4/WS6 | P1 | WS4/US16 | `Features/Live/DeltaTracker.cs`: position-keyed reference curve from the fastest complete valid lap, linear-interpolated Delta + TargetLapTime; reader-thread-owned (no locking, like the Go single-goroutine). Manual reference is a stubbed seam (`SetManualReference`/`ClearManualReference`) — the `dash.target.set` wiring is WS8. |
| Capture: GDI mirror renderer (rear-view) | `app/internal/capture/capture_windows.go` | Missing | WS7 | P2 | WS7/US30 | Windows-only; dev-gated feature. |
| Capture: idle frame (black / pixelated clock) | `capture/capture_idle.go` | Missing | WS7 | P2 | WS7/US30 | |
| Capture: region-selection overlay (native GDI drag/resize) | `capture/overlay_windows.go`; React rear-view selector | Missing | WS7 | P2 | WS7/US30 | `DeviceSelectCaptureRegion` bridge; React UI is `import.meta.env.DEV` gated. |
| Rear-view purpose + config (RearViewConfig capture x/y/w/h + idle mode) | `devices/*` PurposeConfig; React Devices rear-view | Missing | WS7 | P2 | WS7/US30 | Dev-gated. |
| Device catalog (addable entries, generic→scan, embedded presets) | `devices/catalog.go` | Partial | WS5/WS7 | P1 | WS5/US22 | .NET Catalog loads presets and preserves offset/margin/bindings; generic→USB-scan path missing. |
| Device add/scan bridge (generic scan, picker, auto-rotate) | `app/app_dashboard.go`/`app_hardware.go` Device* | Partial | WS7 | P1 | WS7/US31 | .NET adds catalog entries; no USB scan / picker. |
| Device management bridge (rename/rotation/offset/layout/purpose/status) | `app.go` Device* setters | Partial | WS5/WS7 | P1 | WS5/US22 | .NET runtime persists rename/rotation/offset/margin/layout through `UpdateDevice`; purpose/status/hot-reload remain WS7. |
| Device list UI grouped by type w/ live status | React `Devices.tsx`, `DeviceSection.tsx` | Partial | WS7 | P1 | WS7/US31 | .NET cards exist; live status dots / SCREEN_EVENTS missing. |
| Device detail UI (rename/orientation/position/dash-assign/enable) | `DeviceDetail.tsx` | Partial | WS7 | P1 | WS7/US31 | .NET has enable/disable/remove; orientation/position/dash-assign missing. |
| Screen status & events (`devices:updated`, `screen:connected/disconnected`) | `devices/events.go`, `status.go` | Missing | WS7 | P1 | WS7/US31 | |

---

## 5. Per-workstream sections

> Each section lists the PRD goal, acceptance criteria, the parity rows it owns
> (by feature area / matrix section), and **explicit DEFERRED / out-of-scope**
> items (US44 — never mistake incomplete for done).

### WS1 — Migration Inventory & Stale-Reference Cleanup

**Goal:** Produce an explicit old-desktop parity checklist and purge dead
Wails/app-frontend references so setup matches the Avalonia architecture.

**Acceptance criteria:**
- Parity checklist enumerating every old Wails/app-frontend capability w/
  migrated/deferred/dropped status in repo docs (US7).
- All stale Wails/app-frontend references in docs, comments, Makefile, tooling
  removed or annotated as intentional historical context; setup describes the
  .NET 10 Avalonia solution only (US6).
- Deferred items documented as deferred in a single tracked location (US44).
- Large scopes (this workstream set) recorded with acceptance criteria as durable
  context (US42).
- A grep/check confirms no remaining live references to retired Wails build
  steps, `frontend/dist` embed, or `app/frontend` in active desktop tooling.

**Owns:** this document itself; stale-reference purge in `Makefile`, docs, comments,
tooling. (No `Graphite.cs`-vs-`docs/DESIGN.md` palette contradiction exists on this
branch — see section 2. The only design open item is confirming fidelity against
`docs/Sprint.fig`, tracked as Open Question #6.)

**DEFERRED / out-of-scope:**
- This session did **not** run the grep/check for residual Wails references
  (SDK/tooling not exercised); the cleanup PR must run and record it.
- Confirming design fidelity against `docs/Sprint.fig` is **flagged, not
  resolved** — needs maintainer input (Open Question #6). `Graphite.cs` already
  matches `docs/DESIGN.md`, so this is a Figma-fidelity confirmation, not a fix.
- The old `app/frontend` Vite tree is left physically in place (not in the
  solution); its deletion is a separate decision.

### WS2 — Desktop Solution & Tooling Hardening

**Goal:** Lock in the .NET 10 solution layout, project boundaries, and CI/build.

**Acceptance criteria:**
- `app/` contains the solution + 4 named projects, no desktop project directly
  under the app root (US1, US2).
- Client references the shared API contract but does not own game data formats;
  project references enforce the seam (US3).
- All projects target .NET 10 consistently; restore/build/test/publish succeed
  from a clean checkout (US8).
- CI restores+builds the solution and runs `Sprint.Desktop.Tests` on every change
  (US8).
- DI / explicit composition roots where modules need dependencies; no
  service-locator/hidden-singleton wiring.
- Existing lightweight tests (shell state, drag policy) wired in and stay green.

**Owns:** solution/project-file rows (section 3 first table), composition-root
refactor of MainWindow, logging seam (matrix 4.9), CI.

**DONE (2026-06-29):** `global.json` pins SDK 10.0.301; `app/Directory.Build.props`
centralizes shared props + version; **explicit composition root** injects
MainWindow's deps (no hidden wiring); **test project migrated to xunit**
(`dotnet test`; Makefile + CI updated to `dotnet test app/Sprint.Desktop.sln`);
clean restore/build incl. `-warnaserror` + tests (4/4) verified.

**DONE (2026-06-29, WS3 session):** the **headless Avalonia harness** is in —
`Avalonia.Headless` 12.0.5 + `HeadlessShellTests` build/show/close `MainWindow`
under a real Avalonia context (drives `HeadlessUnitTestSession` directly; the
`.Headless.XUnit` package is incompatible — xunit v3 vs our v2).

**DEFERRED / out-of-scope (remaining WS2):**
- **RID/publish targeting:** `make build-app` already passes `-r win-x64
  --self-contained false -o app/build/bin`, but the sln/csproj don't declare a
  `RuntimeIdentifier(s)` (the sln's x64/x86 configs still map to Any CPU). Make it
  intentional in the project file (shared with WS10). Low-risk/mechanical.
- **Logging seam** (matrix 4.9) not yet added — defer to WS4, where the
  reconnect/probe loop is its first real consumer (avoids a consumer-less abstraction).

### WS3 — Shared Desktop/Game Contract Design

**Goal:** Define a stable `Sprint.Desktop.Api` contract that adapters feed and the
UI consumes, with no game-specific knowledge.

**Acceptance criteria:**
- Api exposes telemetry frames, session/car/input/flags/timing/controls state,
  adapter health + explicit disconnected/stale/invalid states (US5, US14, US18).
- Api contains no game-specific paths/shm names/binary layouts/parser quirks/
  Avalonia UI types (US4).
- Engineer commands + staged car-control changes represented in the contract
  (US19, US20).
- Contract tests verify invariants + handling of missing/stale/invalid frames.
- Documented as the single source Client consumes and Games implement; Demo maps
  to the same contract (US5).

**Owns:** matrix 4.2 contract rows, the **health/stale/invalid gap (P0)**,
`ITelemetrySource` redesign (add Connect/Disconnect/health/async semantics), the
engineer-command contract shapes.

**DONE (2026-06-29):** design adversarially critiqued (judge panel: go-with-adjustments)
then implemented + adversarially reviewed (verdict: ship, 0 must-fix). Landed:
`TelemetryConnectionState`+`TelemetryStatus`+`TelemetryFreshness`; redesigned
`ITelemetrySource` (lifecycle+health+IDisposable, full doc-contract); demo source
on the new shape (pure healthy-link sim); honest titlebar/Live status via
`TelemetryStatusPresenter`+`RateMeter` (the "SIM DEMO/60Hz/green" lie removed);
engineer command/event/staged-change shapes mirroring `pkg/dto/engineer.go`. 25
tests, build 0/0 `-warnaserror`.

**DEFERRED / out-of-scope:**
- The **async background reader + 5s reconnect/probe loop + buffered ~30Hz handoff +
  delta augmentation** are the WS4 *engine* — the WS3 contract is deliberately a
  sync-pull adapter so WS4 builds against it without a second redesign (Open Q7).
- The degraded states (Connecting/WaitingForGame/Stale/Faulted/invalid-frame) have
  **no WS3 emitter** (demo is a healthy-link sim) — covered by pure presenter tests;
  first end-to-end exercise is WS4. A subtly wrong derivation rule surfaces in WS4.
- Engineer **transport + polymorphic Payload decode + Engineer-page wiring** are WS9;
  WS3 only defines the shapes. **Gate WS9 on these shapes (now landed).**
- Atomic-publish (Volatile/Interlocked) for `Status`/`Current` is a *doc* contract,
  not type-enforced; the single-threaded demo doesn't exercise it. WS4's off-thread
  reader MUST honor it (the demo is not a template for that pattern).

### WS4 — Real Game Adapter Slice (Le Mans Ultimate)

**Goal:** Implement LMU as the first real telemetry adapter end-to-end; keep Demo
dev/test only.

**Status (2026-06-30): substantially complete.** The LMU adapter (parser + mapper +
Windows shm provider), the `CreateSource(descriptor)` factory, the consumer-side
`TelemetryEngine` (background reader thread, 5s reconnect/probe loop, ~30Hz buffered
latest-value handoff, real-rate measurement) and the non-mutating `DeltaTracker` all
landed. Design was adversarially critiqued (5-lens panel) before coding and the
implementation adversarially code-reviewed (5 dims → skeptic-verify); all confirmed
findings fixed with regression tests. Build is green with `-warnaserror`; 69 desktop
tests pass. **Remaining for WS4 sign-off:** a live `make dev-app` GUI run against a
running LMU (only synthetic-snapshot + headless paths verified so far), and a
maintainer decision on the default/selected game (CompositionRoot still defaults to
demo). Linux `/dev/shm` and the dash idle page-snap remain deferred (Windows-first /
WS6).

**Acceptance criteria:**
- LMU adapter maps real shared-memory/binary data to the shared contract (US15,
  US16).
- Games is the only place that knows LMU paths/shm names/structs/parser (US4).
- Connection/shm failures surface as visible, non-fatal UI status; never crash
  (US17).
- Live telemetry updates in real time; disconnected/stale/invalid reflected in UI
  (US13, US14).
- Deterministic parser tests use captured/synthetic frames.
- Demo remains a dev/test adapter, not parity for real game support.

**Owns:** matrix 4.3 rows (LMU adapter, struct layout, shm reader,
`CreateSource(descriptor)` factory), plus the background-thread / buffered
latest-value handoff and probe/reconnect loop (matrix 4.2), and delta tracking
(matrix 4.9).

**DEFERRED / out-of-scope:**
- Additional game adapters beyond LMU — out of scope; LMU is the proof-of-pattern.
- Linux `/dev/shm` parity — Windows-first acceptable; Linux is best-effort.
- `.NET` shared-memory + packed-struct interop strategy is an **open risk**.

### WS5 — Runtime Persistence

**Goal:** A persistence module with a small interface for settings, devices, dash
layouts, setup programs, and one-time migration of old local data.

**Acceptance criteria:**
- Settings persist across launches (US21).
- Saved devices persist (US22).
- Dash layouts persist (US23).
- Old local desktop data migrates without discarding useful config (US24).
- Persistence centralized behind a small interface (settings/devices/layouts/
  setup/migrations), not scattered through views.
- Persistence tests run against temp dirs, never real AppData.

**Owns:** matrix 4.4 rows. WS5 now persists setup programs, preserves the
previously lossy dash/settings/device preset fields, migrates old portable
settings/device/layout files once into the new store, and exposes the runtime
through `IDesktopRuntime` so the shell no longer depends on the concrete class.
Remaining WS5 work is the portable-vs-AppData product decision; full
renderer/hardware profile consumption continues under WS6/WS7.

**DEFERRED / out-of-scope:**
- Portable `data/`-next-to-exe semantics (old behavior) vs `%AppData%/Sprint`
  (new) — confirm intended location with maintainer before migration.
- Cloud/sync persistence — out of scope.

### WS6 — Dash Rendering & Editor Parity

**Goal:** Restore dash rendering + the full editor (catalog, inspector,
move/resize, page tabs) to old parity.

**Acceptance criteria:**
- Default dash preset renders accurately (US25).
- Create/edit layouts via catalog/inspector/move/resize/page-tab reaching old
  parity (US26, US27).
- Predictable widget layout behavior — no broken screens (US28).
- RPM/speed/gear/fuel/lap timing/delta/flags/tyres/input widgets available
  (US29).
- Renderer tests verify layout+widget behavior through renderer/model interfaces.
- Dash widgets compose reusable Graphite frame controls; editor uses
  MVVM/presenter seams testable without launching the app.

**Owns:** all of matrix 4.5 (painter port, element renderers, widget registry +
~90 bindings, 23 widget types, layout schema + validation, editor canvas/palette/
inspector/pages/stacks, theme manager, alerts editor, live preview pipeline).

**IN PROGRESS (2026-07-01):** First .NET renderer/model seam landed:
`DashPreviewRenderer` produces test-covered render plans with per-widget bounds
and resolved catalog bindings, and the Dashes page preview consumes that seam.
The first editor reducer seam also landed: `DashLayoutEditor.TryMoveWidget`,
`TryResizeWidget`, `TryDeleteWidget`, `TryClearPage`, `TryAddWidget`, `AddPage`,
`TryRenamePage`, and `TryDeletePage` cover grid geometry, overlap checks, widget
placement/deletion, page clearing, and regular-page management. The Dashes page
now wires custom-layout Add page through the reducer and `SaveDashLayout`. This
does not settle the painter backend, full widget visuals, drag/resize/delete UI,
palette UI, full editor save wiring, locked Idle/Alerts behavior, or
inspector/page-tab parity yet.

**DEFERRED / out-of-scope:**
- **Dash painter port strategy is open** (re-implement `gg` pipeline in .NET vs
  SkiaSharp vs Avalonia rendering) — see Open Questions. Throttle cache + optical
  centering + inherited-override clearing are P2, deferrable after base render.
- In-browser HTML/CSS `WidgetPreview` is a React-specific alternative; .NET may
  rely solely on a rendered-image preview (P2).
- Page-cycle dynamic commands span into WS8 (input).

### WS7 — Hardware Display Pipeline

**Goal:** Restore VoCore + USBD480 output behind a display-device interface with
fake (test) + real (Windows) adapters.

**Acceptance criteria:**
- VoCore + USBD480 support restored (US30).
- Device scanning + connection status exposed (US31).
- Rendered dash frames sent to real displays (US32).
- Hardware/transport failures appear as UI status, never crash (US33).
- Display-device interface w/ fake adapter for tests; real adapters isolated to
  Windows; I/O off the UI thread w/ explicit lifecycle/cancellation.
- Hardware tests use fake adapters for scan/connect/status + frame-output.

**Owns:** all of matrix 4.6, plus device management/detail UI + scan + status
events (matrix 4.9 device rows) and capture/rear-view (dev-gated).

**DEFERRED / out-of-scope:**
- **WinUSB-in-.NET interop is an open risk** (no CGO equivalent; need
  P/Invoke/SetupDI/WinUSB or a managed wrapper).
- Capture / rear-view mirror + region overlay are **dev-gated P2** — defer until
  core dash output works.
- Linux (gousb) hardware paths — out of scope (Windows-first).
- Frame output depends on the WS6 painter port; do not block hardware seam design
  on it (use the fake adapter + a placeholder frame source).

### WS8 — Input & Command Binding

**Goal:** Restore joystick/input detection + command binding as a UI-independent
command model with listen mode and persistence.

**Acceptance criteria:**
- Joystick/physical input binding restored to trigger Sprint commands (US34).
- A binding listen mode (US35).
- Bound commands persist across sessions (US36).
- Input detection + binding represented as a command model independent of UI
  controls.
- Tests verify command formatting, listen mode, persistence, unavailable-input.
- Binding rows compose the reusable Graphite binding-row control; unavailable
  states explicit.

**Owns:** all of matrix 4.7, plus the dynamic dash-page-cycle command wiring
(matrix 4.5 page-cycle row).

**DEFERRED / out-of-scope:**
- **Windows Raw Input in .NET is an open interop item** (HidP APIs, OS-thread
  message loop).
- Per-device binding routing + active-dash-scoped binding UI are P1/P2 layers atop
  the base command model — sequence after the model + capture work.

### WS9 — Engineer / Web / API Integration

**Goal:** Update shared DTO assumptions away from Wails and keep desktop engineer
events compatible with the wider Sprint API/web system.

**Acceptance criteria:**
- Shared DTO assumptions in `pkg/dto` / `packages/types` updated away from Wails
  (US37).
- Engineer commands + staged car-control changes flow through shared contracts
  (US19, US20).
- Desktop events remain compatible with the wider Sprint system within
  shared-contract scope.
- Changes to `api/`/`web/` limited to what shared-contract/engineer integration
  requires; avoid out-of-scope rewrites.
- Affected consumers updated, or follow-up explicitly called out, when shared
  DTOs/types change.

**Owns:** matrix 4.8 rows (engineer wire-up, shared DTO de-Wailsing, setup program
edit/compare). Setup-program persistence is shared with WS5.

**DEFERRED / out-of-scope:**
- Broad `api/`/`web/` rewrites — explicitly out of scope; touch only what shared
  contracts require (per `AGENTS.md` focus rules).
- Engineer Setup A/B comparison + synthetic prediction are P2.
- Real engineer↔web sync transport (beyond contract shapes) — defer; old desktop
  surface had no active consumer.

### WS10 — Packaging, Updates & Release

**Goal:** Make desktop packaging intentional: artifact naming, version/icon
metadata, assets/presets, installer, signing, updater.

**Acceptance criteria:**
- Executable + release-artifact naming intentional; release workflows publish the
  Avalonia client with no Wails dependency (US9, US10).
- Published builds include correct icons/assets/presets/version metadata (US38).
- An installer/packaging strategy for clean install (US39).
- Updater ported, replaced, or explicitly removed (US40).
- Signing + version metadata intentional + documented.
- Release validation: restore/build/test/publish + artifact-launch smoke +
  asset/preset-inclusion checks.

**Owns:** matrix 4.9 packaging/release rows + RID/publish targeting (shared w/
WS2).

**DEFERRED / out-of-scope:**
- **Updater port-or-drop is an explicit open decision** (US40) — the old
  GitHub-release self-replace flow is Windows-batch; decide port vs replace vs
  remove. Until then the Settings "Check now"/version-badge UI stays partial.
- Code signing certificates / process — needs maintainer/infra input.

### WS11 — Final Parity Gate

**Goal:** Verify production-quality launch + end-to-end parity via a manual smoke
script + stable-seam tests, with deferrals documented.

**Acceptance criteria:**
- App launches reliably; custom titlebar controls work without click crashes
  (US11, US12).
- Manual smoke script checks launch/telemetry/devices/dash-edit/settings/
  published-artifact behavior (US41).
- Tests sit at stable behavior-oriented seams (runtime/presenter/contract/adapter/
  fake-hardware) (US43).
- All user-visible failure states modeled + verified across surfaces
  (disconnected/stale/unsupported/permission-denied/device-busy/invalid-frame/
  retrying) (US14, US17, US33).
- Deferred items documented as deferred; WS1 checklist reconciled to a final
  pass/defer state (US44).
- Accessibility basics verified (keyboard nav, focus, contrast, icon-only
  tooltips, stable layout under text changes).

**Owns:** shell stability + click-crash safety (matrix 4.1), shared failure-state
visuals (matrix 4.1), splash/keyboard-shortcuts (P2), the manual smoke script, and
final reconciliation of this document.

**DEFERRED / out-of-scope:**
- This gate runs **after** WS2–WS10; it does not implement features, it verifies.
- The final pass/defer reconciliation must re-walk every matrix row and flip
  status — do not close WS11 with any row still ambiguous.

---

## 6. Test-seam plan (per module, highest practical seam)

Per the PRD testing decisions, test at stable, behavior-oriented seams so
implementation can change without rewriting the suite (US43).

| Module / area | Seam to test | What to assert |
| --- | --- | --- |
| **Api (WS3)** | Contract invariants on `TelemetryFrame` + health states | Frame field invariants; correct handling of **missing / stale / invalid** frames; disconnected/invalid state transitions. No game/UI deps leak in. |
| **Games (WS4)** | Adapter/parser against captured or synthetic frames | Deterministic decode of LMU packed structs → contract; NaN/Inf sanitisation; fuel-per-lap rolling; sector/lap timing; reconnect/ErrNotRunning treated as non-fatal. Demo source advances deterministically. |
| **Runtime persistence (WS5)** | `DesktopRuntime` (and successor interface) against **temp dirs** | Preset load + fallbacks; settings/devices/layouts/setup round-trip; migration of old data; never touches real AppData. |
| **Live/presenter (WS6)** | `LiveTelemetryPresenter` (frame→snapshot) pure mapper | m/s→kph, lap formatting, per-corner temps; extend to flags/electronics/energy/penalties as widgets land. |
| **Dash render+editor (WS6)** | Renderer/model interfaces (not pixel-exact visuals) | Layout validation (bounds/overlap/layer rules) as save gate; grid clamp math (move/resize); widget catalog + binding resolution; widget-stack/layer reducers; theme resolution + override clearing. |
| **Hardware (WS7)** | Fake display adapter behind the display-device interface | Scan/connect/status transitions; frame-output behavior; RGB565 conversion + rotation/margin/offset (port the Go `rgb565_test.go` assertions); failure → UI status, no crash. |
| **Input (WS8)** | Pure command model + listen-state reducer | Command id formatting/compaction; listen mode start/cancel/reduce + keyboard fallback; binding persistence round-trip; unavailable-input behavior. |
| **Shell (WS2/WS11)** | `WindowDragPolicy`, `ShellState` (pure POCO/helper) | Chrome-vs-drag classification; nav + sidebar width/title; keep existing green tests as prior art. |
| **Engineer/web (WS9)** | Engineer staged-change reducers + shared command shapes | Stage/revert/push diffs; radio-log append/cap; staged-change contract round-trip. |
| **Packaging (WS10/WS11)** | Release validation script | restore/build/test/publish succeed; published artifact launches (smoke); assets/presets/icons/version metadata included. |

**Cross-cutting:** migrate the hand-rolled console-`Assert` runner to a real test
SDK (or formalize it) so CI integrates cleanly (WS2). Keep all seams pure /
dependency-injectable (the `DesktopRuntime` dataRoot/presetRoot pattern is the
model).

---

## 7. Open questions / risks

| # | Topic | Risk / decision needed | Owning WS |
| --- | --- | --- | --- |
| 1 | **Dash painter port strategy** | The Go painter is a `gg`-based image pipeline with embedded TTFs, pre-baked backgrounds, per-widget sub-context caching, and RGB565 output. Re-implement in .NET via SkiaSharp? Avalonia's render surface? A standalone image library? This decision shapes WS6 + WS7 (frame source) heavily. | WS6 |
| 2 | **Shared-memory interop in .NET** | LMU reads a named shared-memory region with a packed `_pack_=4` binary layout (`MemoryMappedFile` + `Marshal`/`Span` struct reads). Field-alignment fidelity is parity-critical; needs captured frames to validate. | WS4 |
| 3 | **WinUSB in .NET** | Go used native WinUSB (no CGO/libusb) + SetupDI enumeration + `pnputil` install. .NET has no CGO equivalent — P/Invoke to WinUSB/SetupAPI, or a managed USB wrapper? Affects VoCore/USBD480 + driver install. | WS7 |
| 4 | **Windows Raw Input in .NET** | HID button/encoder capture used an OS-thread message loop + HidP APIs. Porting requires a hidden message window + P/Invoke; threading model must stay off the UI thread. | WS8 |
| 5 | **Updater: port, replace, or drop** | The old GitHub-release self-replace flow is a Windows batch script. Decide whether to port, replace with a packaging-native updater, or drop (US40). Gates the Settings update UI + UpdateToast. | WS10 |
| 6 | **Design typography** — RESOLVED 2026-06-29 | Maintainer confirmed `docs/Sprint.fig` mandates **Inter** (UI) + **Space Grotesk** (display). Design layer migrated off `IBM Plex Sans`: fonts bundled under `Sprint.Desktop.Client/Assets/Fonts`; `Graphite.FontStack`/`DisplayFontStack` + `docs/DESIGN.md` updated; build-verified. Remaining: render-verify on a GUI run + full component fidelity to the Figma (WS6). | WS6 |
| 7 | **Telemetry threading model** | The WS3 contract now *supports* the old design (sync-pull adapter + a consumer-owned loop), and the false "60Hz" label is gone (real measured Hz via `RateMeter`). **Still open for WS4:** the actual background read thread + cancellation/dispose + 5s reconnect + non-blocking ~30Hz buffered handoff + delta augmentation (a `with`-copy, never mutating the adapter frame). The current 500ms UI-thread `DispatcherTimer` is the WS3 stand-in WS4 replaces. | WS4 |
| 8 | **SDK availability / build verification** — RESOLVED 2026-06-29 | The .NET **10.0.301** SDK is installed under the **x86** host `C:\Program Files (x86)\dotnet` (the x64 `dotnet` on PATH has only a 6.0.5 runtime — why `dotnet --version` first appeared to fail). `dotnet build app/Sprint.Desktop.sln` is **clean (0/0)** and `make test-app` is **4/4**. Still TODO in WS2: add `global.json` to pin the SDK so the build isn't environment-luck. | WS2 |
| 9 | **Portable data location** | Old app stored `data/` next to the exe (portable); .NET uses `%AppData%/Sprint` but now probes `AppContext.BaseDirectory/data` for one-time device/layout migration. Product decision still needed for whether new writes should remain in AppData or return to portable mode. | WS5 |
| 10 | **"AI improvements" scope undefined** | The maintainer explicitly wants "some AI improvements," but PRD #107's workstreams (1–11) define none. Surface (engineer assistant? setup advisor? telemetry insights?), model, data flow, and on-device vs API are **all unspecified** — needs a dedicated mini-PRD / maintainer input before any agent plans against it. Treat as a separate workstream (WS12), not folded into the migration. | (unassigned / WS12) |
| 11 | **Model-fidelity data loss is silent** | The main WS5 lossy fields are now modeled/preserved, including dash idle/alerts/config, settings dashEditorUI, device geometry/bindings, and unknown dash/widget extension data. Remaining fidelity risk lives in unmodeled WS6 schema areas such as widget stacks/theme/format semantics until the renderer/editor port lands. | WS5/WS6 |
| 12 | **Test runner is not a real SDK** | `Sprint.Desktop.Tests` is a console Exe with a local `Assert`. CI integration, parallelism, and discovery require migrating to xunit/nunit (or wrapping the runner). | WS2 |
