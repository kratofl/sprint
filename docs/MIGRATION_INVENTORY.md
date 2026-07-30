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

> **Build verification (updated 2026-07-04):** the .NET **10.0.301** SDK is
> installed under the **x86** host `C:\Program Files (x86)\dotnet` (the x64
> `dotnet` on PATH carries only a 6.0.5 runtime — which is why `dotnet --version`
> first appeared to fail). `dotnet build app/Sprint.Desktop.slnx -warnaserror`
> **succeeds clean (0/0)** and `dotnet test` **passes 213/213** (up from 25 —
> WS6–WS11 added the SkiaSharp dash painter + widgets + editor, RGB565 +
> screen-driver + publisher, the command/binding/capture model, engineer staging +
> setup A/B, the update checker, shared surface-state presenter, visual smoke,
> and headless dash-editor render/click/drag/resize coverage). `dotnet publish -r win-x64` is verified to emit
> the exe with presets/fonts/appicon included. `global.json` pins the SDK (WS2).
> View *construction* + painter *pixels* are headless-verified; full on-wheel
> *visual* behavior and any real hardware/game path still need a `make dev-app` GUI
> run against live hardware. Use the x86 host explicitly — the x64 `dotnet` on PATH
> lists no 10.x SDK (CI installs the SDK via `global.json`).

---

## 0. Reconciliation (2026-07-01) — WS11 final gate

Per-workstream final status after the WS6–WS11 implementation pass. Build is clean
with `-warnaserror`; 213 desktop tests pass. Items marked **Deferred** are tracked,
not forgotten (US44) — most are hardware/OS-interop paths that cannot be verified in
CI without a physical device or a running game.

| WS | Area | Status | Notes |
| --- | --- | --- | --- |
| WS1 | Inventory & cleanup | **Done** | This doc; stale-Wails purge landed earlier. |
| WS2 | Solution & tooling | **Done** | 4 projects, DI composition root, xunit, `global.json`, `-warnaserror` gate, RID target (with WS10). |
| WS3 | Shared contract | **Done** | Health/stale/invalid states; engineer command shapes. |
| WS4 | LMU adapter | **Done (sw)** | Parser/mapper/engine/delta green over synthetic frames; **live-game run deferred**. |
| WS5 | Persistence | **Done** | settings/devices/layouts/setup/controls round-trip; portable-vs-AppData is a product call. |
| WS6 | Dash render + editor | **Done (core)** | SkiaSharp `DashPainter` renders the default preset + 12 critical widgets + flag/alert overlays; three-pane editor (palette/canvas drag-move-resize/inspector/page-tabs) on the `DashLayoutEditor` reducers; real preview + thumbnails. **Deferred:** full 23-widget catalog + ~90-binding resolver, widget stacks, theme manager, per-widget style/config inspector, in-editor grid resize of the layout itself. |
| WS7 | Hardware display | **Done (fake-verified)** | RGB565 (ported + tested), `IScreenDriver`/fake adapter, dashboard + desktop-capture frame sources, off-thread `ScreenPublisher`, `DeviceScreenService` coordinator, purpose-driven device UI, transparent aspect-locked capture selector, Windows GDI rear-view capture, and WinUSB VoCore/USBD480 drivers + factory. **Deferred (hardware-gated, Open Q#3):** live USB verification, generic→scan device picker, and WinUSB `.inf` installer. |
| WS8 | Input & binding | **Done (core)** | `CommandBus`, `controls.json` persistence, `BindingResolver`, `InputCaptureReducer`, keyboard-fallback bindings UI. **Deferred (Open Q#4):** Windows Raw Input physical-button capture, per-device binding-routing UI, page-cycle→on-hardware page effect. |
| WS9 | Engineer/web | **Done (core)** | `EngineerStageService` (staged diff via the shared `StagedControlChange` contract, push/revert, command builders), setup A/B compare + delete. **Deferred:** real engineer↔web transport beyond the contract shapes. |
| WS10 | Packaging/release | **Done** | Intentional win-x64 publish (verified), version+channel reporting (`BuildInfo` + Settings badge), channel-aware `UpdateChecker` + manual check. **Decision (Open Q#5):** check + notify + manual download; self-replacing auto-install deferred. |
| WS11 | Final gate | **Done** | Shared `SurfaceState` presenter + `Graphite.StatePanel` (empty/loading/disconnected/stale/unsupported/permission-denied/device-busy/invalid-frame/retrying), keyboard nav (Alt+1..7) + icon tooltips + focus, `docs/DESKTOP_SMOKE.md`, this reconciliation. **Deferred:** splash overlay (P2), full GUI/hardware smoke run. |

**Cross-cutting deferrals** (require a device, a running game, or a maintainer call —
never silently "done"): live LMU telemetry, real VoCore/USBD480 output, physical
joystick capture, portable-data-location decision, code signing, and the
theme-manager surfaces. The dash painter DSL (ColorExpr /
Condition / widget stacks / per-widget update-rate cache) was intentionally not
ported — the fixed critical-widget set uses direct renderers (see WS6 §5).

## 1. Header context: the migration at a glance

| Old stack | New stack |
| --- | --- |
| Wails desktop (Go backend) | .NET 10 + Avalonia 12.0.5 (Desktop + Fluent) |
| Embedded React/Vite frontend (`app/frontend`, `//go:embed frontend/dist`) | Imperative Avalonia C# (`Sprint.Desktop.Client`), MVVM/presenter seams to be introduced |
| Go shared-memory + WinUSB + Raw Input | .NET interop (shared-memory, WinUSB, joystick) — **largely unported** |
| `pkg/dto` Go telemetry spine | `Sprint.Desktop.Api` `TelemetryFrame` contract |
| Go embedded TTFs + `gg` painter | Dash painter port strategy **open** (see risks) |

The old Vite `frontend/` tree still physically sits in `app/` but is **not** part
of `Sprint.Desktop.slnx`. WS1 owns purging stale Wails / `frontend/dist` / embed
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

## 3. Current .NET desktop status snapshot

### Solution & project files

| Item | Status | Detail |
| --- | --- | --- |
| `Sprint.Desktop.slnx` | implemented | VS2017-format; Debug/Release × Any CPU/x64/x86, but every x64/x86 maps `ActiveCfg` back to Any CPU (no real per-RID build). |
| `Sprint.Desktop.Client.csproj` | implemented | net10.0 WinExe, Avalonia.Desktop + Themes.Fluent 12.0.5, SkiaSharp dash painter, refs Api+Games, copies Assets/presets/appicon, declares `RuntimeIdentifiers` for win-x64 and linux-x64, and supports self-contained single-file publish. |
| `Sprint.Desktop.Api.csproj` | implemented | net10.0 classlib, no deps, no project refs — pure contract assembly; lock file present. |
| `Sprint.Games.csproj` | implemented | net10.0 classlib referencing Api only; lock file present. |
| `Sprint.Desktop.Tests.csproj` | implemented | net10.0 **xunit** project (Microsoft.NET.Test.Sdk 18.7.0 + xunit 2.9.3 + runner 3.1.5) **+ Avalonia.Headless 12.0.5**. `dotnet test` covers the contract, runtime, LMU adapter/source, telemetry engine, dash render/editor, hardware fakes/RGB565, input binding, updates, shell, and visual smoke seams. |
| SDK pinning / build infra | implemented (WS2, 2026-06-29) | `global.json` pins SDK **10.0.301** (rollForward latestMinor); `app/Directory.Build.props` centralizes LangVersion/Nullable/ImplicitUsings/Deterministic + version metadata. Build verified 0/0 incl. `-warnaserror`. |
| RID / publish targeting | implemented | `RuntimeIdentifiers` are `win-x64;linux-x64`; `make build-app` publishes a self-contained single-file binary to `app/build/bin` with stamped version metadata. |

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
| Engineer command/event contract | implemented | `Sprint.Desktop.Api/Engineer/EngineerContract.cs`: `EngineerCommand`/`EngineerEvent` + `SetTargetLapPayload`/`NotePayload` + `StagedControlChange`, faithfully mirroring `pkg/dto/engineer.go` / `packages/types/src/engineer.ts` with pinned JSON names + snake_case enum discriminators. Client-side staged-change behavior is implemented; real engineer/web transport remains deferred. |

### Client runtime & shell

| Item | Status | Detail |
| --- | --- | --- |
| App / Program (composition root) | implemented (WS2, 2026-06-29) | `AppBuilder.Configure<App>().UsePlatformDetect()`, STAThread classic-desktop; Dark FluentTheme. **Explicit composition root** (`CompositionRoot.CreateMainWindow()`) now builds `DesktopRuntime`/`ShellState`/`ITelemetrySource` and injects them — no hidden `new()` inside the window. (No DI container; explicit root is sufficient at this size.) |
| MainWindow shell (~1,415 lines) | implemented (monolithic) | Custom 32px titlebar, collapsible nav, **all 7 pages + every widget builder inline**; rebuilds whole control tree on each `RenderBody()`. No MVVM/XAML/view separation. **Deps now constructor-injected (WS2)**; per-page/view-model decomposition still TODO (WS6). |
| Live page | implemented | Drains `TelemetryEngine` snapshots on a 33ms UI timer, shows real measured rate/status, and uses the shared frame contract. Demo remains available for development; LMU is available through the source factory. |
| Engineer page | implemented (core) | Stepper rows, staged-vs-car diff, dirty badge, Push/Revert, quick messages, radio log, and staged-change command builders are implemented. Real engineer/web transport remains deferred. |
| Setup page | implemented (core) | Baseline programs, grouped params, duplicate/delete, A/B compare, and persistence are implemented. |
| Dashes page | implemented (core) | Layout list/create/delete, painter-backed previews/thumbnails, three-pane editor, tested move/resize/add/delete/page reducers, and critical widget catalog/bindings are implemented. Full widget-stack/theme-manager parity remains deferred. |
| Devices page | implemented (core) | Catalog add, persisted device cards, enable/disable/remove, status/rotate/offset/dash assignment, and hardware service coordination are implemented. Physical USB verification remains hardware-gated. |
| Settings page | implemented (core) | Driver profile, update channel, version badge, manual update check, `dashEditorUI`, NewDashDefaults, and render-profile publishing are implemented. |
| Help page | implemented | Six static reference cards. |
| `DesktopRuntime` | implemented | Centralized persistence behind `IDesktopRuntime`: settings, devices, per-layout JSON/thumbnails, setup programs, controls, render profile, and one-time old-data migration with temp-root test seams. |
| `ShellState` | implemented | POCO: AppView + sidebar collapsed/width (208/62) + CurrentTitle map. **No INotifyPropertyChanged.** |
| `WindowDragPolicy` | implemented | Pure, unit-tested; blocks drag on Button/TextBox/ComboBox/Slider/ScrollBar/Thumb/SelectingItemsControl. |
| Graphite design system (`Graphite.cs`) | implemented (matches `docs/DESIGN.md`) | Palette (`#070707`/`#0D0D0D`/`#131313`/`#1B1B1B`, accent `#FF6A00`, `#4F9CFF` informational), radius 10, 32px titlebar match `docs/DESIGN.md`. **Typography migrated to the Figma identity:** `FontStack`=Inter, `DisplayFontStack`=Space Grotesk, fonts bundled under `Assets/Fonts` (build-verified). Remaining gap is structural — factory methods, not templated controls (WS6). |
| `AppSettings` model | implemented (core) | updateChannel/driverName/driverNumber + `dashEditorUI` palette/inspector state + NewDashDefaults. `RenderProfile` exposes driver name/number for dash bindings. |
| Feature models (Dash/Device/Engineer/Live/Setup) | implemented (core) | Models preserve the fields used by the migrated runtime, editor, hardware, input, update, and setup surfaces. Richer legacy dash widget-stack/theme/config semantics remain tracked deferrals. |
| `LiveTelemetryPresenter` / `TelemetrySnapshot` | implemented | Pure mapper frame→flat snapshot (speed, lap/sector/delta, inputs, tyres, flags/electronics/energy/session fields used by current widgets). Unit-tested. |
| `TelemetryStatusPresenter` / `RateMeter` | implemented (WS3, 2026-06-29) | Pure, unit-tested Client seams: `TelemetryStatusPresenter.ToView(status, hz, now)` maps health→{Label, RateText, Tone} (applies freshness; flags invalid-frame on a live link); `RateMeter` measures real Hz via EMA (clock-injected). MainWindow connects-on-load, disposes-on-close, resets the meter when not live, and renders both from real `Status`. The WS4 background-reader engine reuses `RateMeter`. |

### Games

| Item | Status | Detail |
| --- | --- | --- |
| `DemoTelemetrySource` | implemented | Deterministic simulator for dev/test. It remains a non-parity source and no longer fakes delta. |
| `GameDescriptor` | implemented | Record (Id, Name, Transport, Available) for the supported-games list. |
| `GameTelemetryPackage` | implemented | Exposes `SupportedGames`, `CreateDemoSource()`, and `CreateSource(descriptor)` for LMU or demo. |
| LeMansUltimate adapter | implemented | `LeMansUltimateTelemetrySource`, `LmuParser`, `LmuTelemetryMapper`, `WindowsLmuSharedMemoryProvider`, and test `InMemoryLmuSnapshotProvider` map LMU shared-memory snapshots to `TelemetryFrame` and truthful status. |

### Tests

| Item | Status | Detail |
| --- | --- | --- |
| Test runner | implemented | Migrated from the hand-rolled console runner to **xunit** + `dotnet test`; `make test-app` and CI run the desktop test project. |
| Tested seams | implemented (software gate) | xunit desktop suite includes runtime device/settings/dash/setup/control persistence, contract/freshness/presenter/rate tests, LMU parser/mapper/source/engine tests, dash catalog/binding/painter/editor tests, hardware fake/RGB565/screen-pipeline tests, input-binding tests, update tests, headless shell lifecycle, and visual smoke PNG capture. **Still uncovered:** physical hardware and live LMU GUI verification. |

### Assets & presets

| Item | Status | Detail |
| --- | --- | --- |
| `presets/dash/default.json` | implemented (core) | Rich 20×12 grid with idlePage, typed widgets, and alerts. C# model preserves idlePage/alerts/widget config; `DashPainter` renders the known/default and critical widget subset. Full legacy theme/stack catalog breadth remains deferred. |
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
| App lifecycle (Startup/DomReady/Shutdown), deferred subsystem start | `app/app.go`, `main.go`, `embedded.go` | Done | WS2 | P0 | WS2/US8 | Explicit composition root creates the window and injected runtime/engine dependencies; background subsystems have lifecycle/disposal seams. |
| Boot gating on `app:ready` + splash | React `App.tsx`, `SplashScreen.tsx` | Deferred | WS11 | P2 | WS11/US41 | Splash overlay is intentionally deferred as presentational P2; app launch is covered by headless and visual smoke tests. |
| Frameless window + custom titlebar controls (min/max/close) | `app.go` (WindowMinimise/Maximise/Close), `WindowControls.tsx` | Done | WS11 | P0 | WS11/US11,US12 | .NET has 32px titlebar + drag + min/max/close (32px matches `docs/DESIGN.md` shell spec). Click-crash safety is US12 — verify titlebar button handlers cannot throw on click. |
| Window drag policy (chrome vs drag region) | `shellHeader.tsx` (app-region) | Done | WS11 | P0 | WS11/US12 | `WindowDragPolicy` pure + unit-tested. |
| Nav rail w/ grouped sections + collapse | `App.tsx`, `appShell.ts`, `SidebarBrand.tsx` | Done | WS2/WS6 | P1 | WS6/US26 | `ShellState` holds collapse/width; MainWindow renders grouped navigation with visual smoke coverage. Broader componentization continues through `SprintComponentTheme`. |
| View history (back/forward) + unsaved-changes guard | `App.tsx` (createViewHistory), `DashEditorHandle` | Deferred | WS6 | P2 | WS6/US27 | Not required for the final parity gate; future dirty-guard work should use a shared confirm dialog. |
| Keyboard nav shortcuts (Ctrl+, Alt+1..9) | `App.tsx` | Done | WS11 | P2 | WS11/accessibility | Alt+1..7 navigation and focus behavior are implemented and smoke-tested. |
| Single content header w/ per-view portal slot | `shellHeader.tsx`, `ViewHeader`/`HeaderPortal` | Deferred | WS6 | P2 | WS6/US26 | The Avalonia shell uses direct composition instead of a React portal abstraction. |
| Home section switcher (Live/Engineer/Setup) | React `Home.tsx` (SegmentedControl) | Done | WS6 | P1 | WS6/US26 | Surfaces are top-level desktop pages rather than a React home switcher. |
| Help static reference | `Help.tsx` | Done | WS6 | P2 | WS6/US26 | Six static cards present in .NET. |
| Reusable Graphite control families (NavRail/Tabs/pills/tiles/cards/rows/frames/dialogs/inputs) | `packages/ui`, React composites | Done (foundation) | WS6 | P1 | WS6/design addendum | `SprintComponentTheme` is the Avalonia theme hook and `Graphite` centralizes recurring primitives. Future slices should add templated controls here instead of one-offs. |
| Shared state visuals (empty/loading/disconnected/stale/unsupported/permission-denied/device-busy/invalid-frame/retrying) | React per-view empty/error states | Done | WS11 | P1 | WS11/US14,US17,US33 | Shared `SurfaceState` presenter + `Graphite.StatePanel` cover the user-visible states. |
| Splash overlay (staged status + fade) | `SplashScreen.tsx` | Deferred | WS11 | P2 | WS11/US41 | Purely presentational; low priority. |
| Update-available toast | `UpdateToast.tsx`, `useUpdateCheck.ts` | Deferred | WS10 | P2 | WS10/US40 | Updater decision is check-and-notify/manual download; a toast is a follow-up UI affordance, not required parity. |

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
| Empty/waiting states (connected-vs-offline distinction) | `Telemetry.tsx` | Done | WS11 | P1 | WS11/US14 | Telemetry status/freshness and shared state panels distinguish disconnected, waiting, stale, invalid, and live states. |
| `IsConnected` probe (init connection state) | `app.go` IsConnected | Done | WS3 | P1 | WS3/US14 | Replaced by `ITelemetrySource.Status` + `TelemetryEngine` snapshot state; no event race from pre-mounted Wails events remains. |
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
| Engineer contract DTO (commands/events) | `pkg/dto/engineer.go` | Done | WS9 | P2 | WS9/US19,US20 | Shared contract shapes exist in Api; staged-change client behavior is implemented. Real cross-surface transport remains deferred. |

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
| Frame rendering pipeline (Paint active/idle page) | `dashboard/painter.go` | Done (core) | WS6 | P0 | WS6/US25 | Port strategy resolved to SkiaSharp `DashPainter`; it renders the default/critical widget path used by previews, thumbnails, and hardware frames. |
| Grid-to-pixel widget dispatch (auto panel/label, throttle, capability-gate, panel rules) | `painter.go` dispatchWidget | Done (core) | WS6 | P0 | WS6/US28 | Implemented for the migrated critical widget set. Full legacy widget DSL remains deferred. |
| Update-rate throttle cache (per-widget sub-context) | `painter_cache.go` | Deferred | WS6 | P2 | WS6/US28 | Perf optimization; not required for the final parity gate. |
| Reusable context + pre-baked background (fixed black canvas) | `painter.go` ensureBg/getContext | Done | WS6 | P1 | WS6/US25 | `DashPainter` renders the fixed on-wheel canvas background. |
| Element renderers (Panel/Text/Dot/Bar/DeltaBar/SegBar/Grid/Condition/Badge) | `painter_draw.go` | Done (core) | WS6 | P0 | WS6/US29 | Covered for critical widgets and overlays through `DashPainter`. Full element DSL remains deferred. |
| Auto text stacking + optical centering | `painter_draw.go` | Deferred | WS6 | P1 | WS6/US28 | Rich legacy text-layout polish remains a follow-up beyond the core painter. |
| Three-layer theme resolution (default→preset/global→layout override) | `painter.go`, `theme_overrides.go` | Deferred | WS6 | P1 | WS6/US26 | Full theme override engine is explicitly deferred; current Graphite render path is centralized. |
| Widget-stack layer state (active layer per page/stack) | `painter.go` SetWidgetStackLayer | Deferred | WS6 | P1 | WS6/US27 | Widget stacks remain a tracked editor/render deferral. |
| Font extraction & caching (Saira values / Inter labels + fallbacks) | `painter_fonts.go`, `fonts/*.ttf` | Done (core) | WS6 | P1 | WS6/US25 | Inter and Space Grotesk are bundled; `DashFonts` centralizes painter font use. |
| Alert overlays (priority order, normal/inverted, full/centered) | `painter_overlays.go`, alerts pkg | Done (core) | WS6 | P1 | WS6/US29 | Critical alert/flag overlay behavior is implemented through the painter path. |
| Flag overlay (RED FLAG/SAFETY CAR/YELLOW banner + tint) | `painter_overlays.go` | Done | WS6 | P1 | WS6/US29 | Flag rendering is covered by painter tests. |
| Theme preset library (6 built-ins + user presets, `dash_themes.json`) | `themes.go` | Deferred | WS6 | P1 | WS6/US26 | Full theme manager/preset CRUD remains deferred. |
| Inherited override clearing | `theme_overrides.go` | Deferred | WS6 | P2 | WS6/US26 | Depends on the full theme override engine. |
| Global setters + ApplyRenderPreferences broadcast | `painter.go`, `core.go` | Done (core) | WS6 | P1 | WS6/US26 | `RenderProfileChanged` and current render profile cover migrated profile bindings; broader render preferences remain deferred with theme/format work. |
| Layout schema (grid + IdlePage + Pages[] + WidgetStacks + per-layout theme/format/alerts) | `dashboard/layout.go` | Partial | WS6 | P0 | WS6/US26 | .NET `DashLayout` reads id/name/default/grid/idlePage/pages.widgets/alerts and preserves widget config; widget stacks, layout theme, format preferences, and validation still missing. |
| Backwards-compatible layout migration (wrapperGroups→stacks, variants→layers) | `dashboard/layout.go` UnmarshalJSON | Deferred | WS6 | P2 | WS6/US24 | Widget stacks/layers are deferred; current migration preserves modeled and extension data. |
| Layout validation (bounds/overlap/layer rules) as save gate | `dashboard/layout.go` ValidateLayout; React `layoutValidation.ts` | Partial | WS6 | P0 | WS6/US28 | .NET validates known widget types, grid bounds, and same-page widget overlap on load/migration/save. Layer/stack-specific validation remains pending with widget stacks. |
| Widget/layout preview rendering (single widget + thumbnail PNG) | `dashboard/painter.go` RenderWidgetPreview/renderPreview | Partial | WS6 | P1 | WS6/US25 | Runtime thumbnails and on-screen preview cards now flow through `DashImageRenderer`/`DashPainter`. Single-widget preview cards and full catalog-accurate thumbnails are still incomplete. |
| Editor live preview pipeline (StartPreview/UpdatePreview/StopPreview, base64 PNG @30Hz) | `core/preview.go`, `app.go` Dash*Preview | Done (Avalonia path) | WS6 | P1 | WS6/US27 | Replaced by in-process painter-backed Avalonia preview and thumbnails rather than Wails base64 events. |
| Dash list grid (cards, preview thumbnails, badges) | React `DashList.tsx` | Partial | WS6 | P1 | WS6/US26 | .NET lists layouts and renders painter-backed preview cards; rich badges remain incomplete. |
| Editor mode router (list/edit/global-settings/theme-edit) | React `DashEditor.tsx`, `dashEditorRuntime.ts` | Partial | WS6 | P1 | WS6/US27 | .NET has create/delete/set-default; no global-settings/theme-edit surfaces. |
| Three-pane editor shell (rail/canvas/properties + toolbar) | `DashEditMode.tsx` | Partial | WS6 | P1 | WS6/US27 | .NET has the three-pane `DashEditorView` with widget palette, painter-backed canvas overlays, inspector, page tabs, and toolbar actions. Rich palette search/categorization, theme/global-settings modes, and deeper per-widget configuration remain incomplete. |
| Grid drag-place/move/resize + live ghost + clamp math | `DashCanvas.tsx`, `canvasDragMath.ts` | Partial | WS6 | P0 | WS6/US27,US28 | Headless Avalonia tests cover click selection, drag-move across selection rebuilds, resize minimum clamping, and resize collision rejection through the real editor view. A live snapping ghost (dashed ember, valid/invalid tinting via `CanPlaceWidget`) now previews move/resize and is captured by `VisualSmokeTests`. Drag-place *from the palette* (vs click-to-add) remains incomplete. |
| Pages + idle page management (locked Idle/Alerts tabs, add/rename/delete) | `DashEditMode.tsx` PageTabs | Partial | WS6 | P1 | WS6/US27 | `DashLayoutEditor.AddPage`, `TryRenamePage`, and `TryDeletePage` provide tested regular-page reducers with unique ids/names and last-page protection; `IDesktopRuntime.SaveDashLayout` persists reducer output. The Dashes card has a headless-tested Add page action for custom layouts. Full page-tab UI, locked Idle/Alerts behavior, active-page state, rename/delete page UI, and full editor save wiring still missing. |
| Selection/delete/page-background/clear-page | `DashEditMode.tsx` | Partial | WS6 | P2 | WS6/US27 | `DashLayoutEditor.TryDeleteWidget` and `TryClearPage` provide tested page-scoped reducers; the editor exposes selection state, a delete button, and clear-page toolbar action that persist reducer output. Page-background editing and richer confirmation/empty-state affordances remain incomplete. |
| Editor widget move/resize reducers (grid clamp + overlap guard) | `DashEditMode.tsx` drag/resize state | Partial | WS6 | P0 | WS6/US26,US28 | `DashLayoutEditor.TryMoveWidget` and `TryResizeWidget` clamp geometry to grid bounds, enforce minimum widget size, and reject overlaps through pure tested seams; `DashEditorView` now headless-tests the Avalonia selection, drag, and resize handles across rebuilds, and `IDesktopRuntime.SaveDashLayout` persists reducer output. Move/resize now render a live snapping ghost preview. Remaining gaps are palette drag-place and richer inspector/config flows. |
| Catalog-backed widget placement reducer | `WidgetPalette.tsx`, `DashCanvas.tsx` placement | Partial | WS6 | P1 | WS6/US26,US28 | `DashLayoutEditor.TryAddWidget` validates catalog types, creates unique widget ids, and places a default-size widget in the first available grid slot without overlaps. The palette is now a Figma-styled panel (WIDGETS header, search filter, category sections, 107x46 icon-tile cards) and move/resize show a live ghost. Palette drag-place, custom default sizes, and config defaults still missing. |
| Widget stacks: create/place/focus-mode/layer list/compare | `multiFunctionWidgetState.ts`, `DashEditMode.tsx` | Deferred | WS6 | P1 | WS6/US27 | Explicitly deferred after core editor parity. |
| Searchable categorized widget palette + preview thumbnails | `WidgetPalette.tsx` | Done (core) | WS6 | P1 | WS6/US26 | A catalog-backed palette exists for the migrated critical set. Search/rich categorization remain deferred. |
| Per-widget config inspector (catalog-driven configDefs) | `WidgetProperties.tsx` | Done (core) | WS6 | P1 | WS6/US27 | Inspector supports current editor mutations; full configDef breadth remains deferred. |
| Per-widget style overrides (font/size/colors/border) | `WidgetProperties.tsx` (style disclosure) | Deferred | WS6 | P2 | WS6/US27 | Tracked with the richer theme/style system. |
| Theme/domain/typography/format editor | `AdditionalSettingsPanel.tsx` | Deferred | WS6 | P2 | WS6/US26 | Theme/format editor is outside the core parity gate. |
| Theme manager (preset cards + swatch strip + CRUD) | `ThemeManager.tsx` | Deferred | WS6 | P2 | WS6/US26 | Full theme manager is a tracked follow-up. |
| Theme resolution + legacy migration (frontend) | `themeOverrides.ts`, `defaults.ts` | Deferred | WS6 | P2 | WS6/US24,US26 | Current Graphite defaults are centralized; legacy theme migration waits for full theme support. |
| Alerts editor (shared settings + per-type toggle catalog) | `AlertsEditor.tsx`, `alertConfig.ts` | Deferred | WS6 | P1 | WS6/US29 | Alerts render/persist for core layouts; rich alert editor is deferred. |
| Legacy per-instance alert migration | `alertConfig.ts`, Go `alerts.MigrateAlertConfig` | Deferred | WS6 | P2 | WS6/US24 | Depends on rich alert editor/config parity. |
| On-wheel widget preview renderer (in-browser HTML/CSS, placeholder data) | `WidgetPreview.tsx`, `widgetPreview/*` | Dropped | WS6 | P2 | WS6/US25 | React/browser preview is replaced by the native painter-backed preview path. |
| Dash painter / live preview model | `dashboard/painter.go`; React preview pipeline | Partial | WS6 | P0 | WS6/US25,US29 | .NET uses `DashPainter` as the single reachable render path for thumbnails, on-screen previews, and hardware frames via `DashImageRenderer`/screen services. The deleted render-plan path is no longer load-bearing. Full themes, formatting, stacks, and full widget parity remain incomplete. |
| Widget registry & catalog (23 types, meta, auto config) | `widgets/widget.go`, `bindings.go` | Partial | WS6 | P0 | WS6/US29 | .NET has a small catalog for default/critical widget types (`header`, `text`, `rpm_bar`, `gear_speed`, `input_trace`, `sector`, `lap_time`, `delta`, `fuel`, `tyre_temp`, `flag`, `tc`) with binding metadata; full 23-type catalog/config defs still missing. |
| Telemetry binding resolution (~90 dot-path bindings + derived) | `widgets/bindings.go`, `binding.go` | Partial | WS6 | P0 | WS6/US29 | .NET now resolves critical/default dash bindings across car speed/gear/rpm/fuel, inputs, lap timing/delta/sector, flags, electronics, tyre surface temps, and profile name/number. Full ~90-path resolver + derived binding engine still missing. |
| Value formatting + format preferences (lap/sector/speed/temp/delta/units) | `widgets/format.go`, `format_prefs.go`; React `lib/format.ts` | Partial | WS6 | P1 | WS6/US29 | .NET presenter formats a subset (kph/lap). Full FormatPreferences merge missing. |
| Color palette/theme/domain types + style/color-expression types | `widgets/palette.go`, `theme.go`, `style.go` | Deferred | WS6 | P1 | WS6/US26 | Full style/color-expression DSL remains deferred; current Graphite palette is centralized. |
| Driving/timing/car-settings/race/info widget families (23 types) | `widgets/widget_*.go` | Done (critical subset) | WS6 | P0 | WS6/US29 | RPM/speed/gear/fuel/lap/delta/flags/tyres/input critical widgets are implemented; full 23-type breadth is deferred. |
| Render profile (DriverName/Number text bindings) | `dashboard/profile.go` | Partial | WS6 | P2 | WS6/US26 | `RenderProfile` + `RenderProfileChanged` expose driver name/number; `DashBindingResolver` resolves `profile.driverName` / `profile.driverNumber`. Painter/editor consumers still pending WS6. |
| Page cycle bridge + dynamic dash-page-cycle commands | `app.go` DashCyclePage; `core.go` ReloadDashCommands | Deferred | WS8 | P2 | WS8/US34 | Coupled to widget-stack/page-cycle follow-up work. |

### 4.6 Hardware display pipeline

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| ScreenDriver interface + factory (VoCore/USBD480) | `hardware/driver.go`, `factory.go` | Done (fake-verified) | WS7 | P1 | WS7/US30 | `IScreenDriver`, fake adapter, factory, and real Windows driver classes are present. Physical verification is hardware-gated. |
| Base driver render+send loop (connect-retry, double-buffer, FPS, events) | `hardware/base_driver.go` | Done (fake-verified) | WS7 | P1 | WS7/US32 | `ScreenPublisher` runs output off the UI thread with explicit lifecycle/cancellation and fake-driver tests. |
| FrameSource auto-management (lazy Painter, external source swap) | `hardware/base_driver.go` | Done | WS7 | P1 | WS7/US32 | `DashPainterFrameSource` feeds painter pixels to the publisher/screen services. |
| Disable/release & reconnect (free USB for other apps) | `hardware/base_driver.go` | Done (core) | WS7 | P2 | WS7/US31 | Device service supports enable/disable/status coordination; physical release behavior still needs hardware verification. |
| FrameSource / ResizableSource interfaces | `hardware/frame_source.go` | Done | WS7 | P1 | WS7/US32 | Frame source abstraction exists in the hardware feature slice. |
| RGB565 conversion w/ rotation/margin/offset (CW90/180/270) | `hardware/rgb565.go` | Done | WS7 | P1 | WS7/US32 | Ported and covered by `Rgb565Tests`. |
| VoCore driver + WinUSB bulk transport (VID 0xC872, PID→dims map) | `hardware/vocore_*.go` | Done (hardware-gated) | WS7 | P1 | WS7/US30 | Windows WinUSB transport/driver classes are implemented; live USB verification remains deferred. |
| USBD480 driver + WinUSB control/bulk transport (VID 0x16C0 PID 0x08A7) | `hardware/usbd480_*.go` | Done (hardware-gated) | WS7 | P1 | WS7/US30 | Windows WinUSB transport/driver classes are implemented; live USB verification remains deferred. |
| Device scan (SetupDI Windows / gousb Linux) | `hardware/vocore_scan_*.go`, `usbd480_scan_*.go` | Done (Windows path) | WS7 | P1 | WS7/US31 | Windows scan path is represented through the factory/WinUSB classes; generic picker polish remains deferred. |
| WinUSB driver install (embedded .inf + pnputil + UAC) | `hardware/winusb_install_windows.go`, `winusb/*.inf` | Deferred | WS7 | P2 | WS7/US33 | Installer/UAC path is intentionally deferred until physical hardware validation. |
| Screen driver-missing event → install prompt | `hardware/events.go`; React `DriverMissingBanner.tsx` | Deferred | WS7 | P2 | WS7/US33 | Depends on the deferred driver installer flow. |
| Hardware/transport failures as UI status (never crash) | base driver events | Done (fake-verified) | WS7 | P1 | WS7/US33 | Hardware states map to visible status and are covered through fake adapters. Physical transport error coverage remains hardware-gated. |

### 4.7 Input & command binding

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Command bus (RegisterMeta/Handle/Dispatch/Catalog/ReplaceDynamic) | `app/internal/commands/commands.go` | Done (core) | WS8 | P1 | WS8/US34 | `CommandBus` provides the UI-independent command model. |
| Binding config persistence (`controls.json`, global + per-device) | `input/config.go` | Done (core) | WS8 | P1 | WS8/US36 | Binding persistence is implemented and tested. |
| Button event dispatch (VID/PID exact then wildcard, route to ScreenID) | `input/detector.go` | Done (core) | WS8 | P1 | WS8/US34 | `BindingResolver` covers command resolution for persisted bindings. |
| Button capture session (listen mode, timeout, encoder ticks) | `input/detector.go` CaptureNextButton | Done (keyboard fallback) | WS8 | P1 | WS8/US35 | Listen-mode reducer and keyboard fallback are implemented. Physical-button capture remains deferred. |
| Windows Raw Input loop (HidP decode, OS-thread message loop) | `input/joystick_windows.go` | Deferred | WS8 | P1 | WS8/US34 | Physical Raw Input capture remains an explicit Windows interop deferral. |
| Input binding merge & reload (global + per-device → detector) | `core/core.go` ReloadInputBindings | Done (core) | WS8 | P1 | WS8/US34 | Runtime/persistence model supports current binding reload semantics. |
| Controls binding bridge (GetCommandCatalog/Get/SaveBindings/CaptureNextButton) | `app/app_controls.go` | Done (core) | WS8 | P1 | WS8/US34,US35 | Avalonia UI exposes command catalog/binding/listen workflows for the supported fallback path. |
| Per-device button bindings bridge | `app.go` DeviceGet/SaveDeviceBindings | Deferred | WS8 | P2 | WS8/US34 | Per-device physical routing UI follows Raw Input support. |
| Bindings tab UI (grouped by command source, active-dash scoped) | React `deviceBindingsViewModel.ts`, `DeviceCommandRow.tsx` | Done (core) | WS8 | P1 | WS8/US35 | Settings/devices expose binding rows for the supported command model. |
| Listen-to-bind capture UI (physical + keyboard fallback, single-flight) | `deviceBindingListenState.ts` | Done (keyboard fallback) | WS8 | P1 | WS8/US35 | Single-flight listen reducer and keyboard fallback are implemented; physical capture deferred. |
| Binding reference data loading (layouts + catalog, reload on layouts-updated) | `deviceBindingReferenceData.ts` | Done (core) | WS8 | P2 | WS8/US34 | Command catalog and current layout/catalog data feed the binding UI. |
| Standalone command handlers (dash.page.next/prev, dash.target.set) | `core/core.go` | Deferred | WS8 | P2 | WS8/US34 | Page-cycle/manual-target commands depend on deferred dash stack/page-cycle work. |

### 4.8 Engineer / web / API integration

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Engineer stage/revert/push car electronics | React `Engineer.tsx`; (new) Engineer page | Done (core) | WS9 | P1 | WS9/US19,US20 | `EngineerStageService` implements staged diffs, push/revert, and command builders against the shared contract. Real backend transport remains deferred. |
| Engineer quick messages + radio log | `Engineer.tsx` | Done (core) | WS9 | P2 | WS9/US20 | In-memory radio/log behavior is implemented; cross-surface sync remains deferred. |
| Shared DTO assumptions updated away from Wails | `pkg/dto`, `packages/types` | Done (contract scope) | WS9 | P1 | WS9/US37 | Desktop vocabulary is now the .NET contract; no active Wails DTO dependency remains for the desktop migration. |
| Engineer commands flow through shared contracts (desktop↔web) | `pkg/dto/engineer.go` | Done (desktop contract) | WS9 | P2 | WS9/US19,US20 | Staged changes are represented by shared command shapes. Real desktop↔web transport remains deferred. |
| Desktop events compatible with wider Sprint API/web | (Wails events) | Deferred | WS9 | P2 | WS9/integration | Wails event compatibility is obsolete; future transport should use explicit API/web contracts. |
| Setup programs (list/select/duplicate/delete/baseline) | React `Controls.tsx`, `setupProgramModel.ts`; .NET Setup page | Done (core) | WS5/WS9 | P1 | WS5/persistence | List/select/duplicate/delete and stepper edits persist locally. |
| Setup edit mode (grouped parameter steppers) | `Controls.tsx` SETUP_GROUPS | Done (core) | WS9 | P2 | WS9/US20 | Grouped parameter steppers are implemented for the migrated setup surface. |
| Setup A/B comparison (predicted-laptime delta) | `setupProgramModel.ts` getSetupPrediction | Done (core) | WS9 | P2 | WS9/US20 | Setup A/B comparison service is implemented; synthetic prediction remains intentionally local. |

### 4.9 Packaging / release / cross-cutting

| Old capability | Old location | .NET status | Workstream | Pri | AC pointer | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Version & build-channel reporting | `app.go` GetVersion/GetBuildChannel | Done | WS10 | P1 | WS10/US38 | `BuildInfo` reads MSBuild version metadata stamped by `make build-app`/release workflow. |
| Auto-update check & install (GitHub releases, self-replace) | `app.go`, `updater/*.go` | Done (manual install) | WS10 | P2 | WS10/US40 | Decision resolved: check + notify + manual download. Self-replacing install is deferred. |
| GitHub release check (channel-aware semver) | `updater/updater.go` CheckLatest | Done | WS10 | P2 | WS10/US40 | `UpdateChecker` + `GitHubReleaseSource` implement channel-aware release checks. |
| Self-replacing install (Windows batch) | `updater/install_windows.go` | Deferred | WS10 | P2 | WS10/US40 | Explicitly deferred as risky unattended behavior. |
| Settings update-channel + manual check + version badge | React `Settings.tsx` | Done | WS10 | P2 | WS10/US40 | Settings shows channel/version and supports manual update check. |
| Executable/artifact naming, icons, assets, presets, version metadata | `main.go` window config, `embedded.go` | Done | WS10 | P1 | WS10/US9,US10,US38 | Release workflow packages named Windows/Linux artifacts with self-contained binaries and assets/presets. |
| Installer / packaging strategy | (Wails build) | Done | WS10 | P1 | WS10/US39 | Strategy is self-contained single-file archives; installer/signing can follow later if needed. |
| Signing + version metadata | (none) | Deferred (signing) | WS10 | P2 | WS10/signing | Version metadata is implemented; code signing needs maintainer certificates/infra. |
| Structured multi-sink logging (daily JSON + stdout, 14-day retention) | `app/internal/logger/*.go` | Deferred | WS2 | P2 | WS2/US8 | No current consumer requires the old logging design; add a .NET logging seam when a real sink is needed. |
| Lap delta tracking: reference store + position tracker + manual reference | `app/internal/delta/*.go` | **Done** | WS4/WS6 | P1 | WS4/US16 | `Features/Live/DeltaTracker.cs`: position-keyed reference curve from the fastest complete valid lap, linear-interpolated Delta + TargetLapTime; reader-thread-owned (no locking, like the Go single-goroutine). Manual reference is a stubbed seam (`SetManualReference`/`ClearManualReference`) — the `dash.target.set` wiring is WS8. |
| Capture: GDI mirror renderer (rear-view) | `app/internal/capture/capture_windows.go` | **Done (software-verified)** | WS7 | P2 | WS7/US30 | `WindowsDesktopRegionCapturer` uses a top-down 32-bit GDI DIB + `StretchBlt`; `DesktopCaptureFrameSource` feeds the existing rotation/margin/offset RGB565 pipeline. Production GDI capture is exercised on Windows; physical USB display verification remains hardware-gated. |
| Capture: idle frame (black / pixelated clock) | `capture/capture_idle.go` | Deferred | WS7 | P2 | WS7/US30 | Coupled to deferred rear-view capture. |
| Capture: region-selection overlay (native GDI drag/resize) | `capture/overlay_windows.go`; React rear-view selector | **Done** | WS7 | P2 | WS7/US30 | Avalonia `CaptureRegionWindow` is transparent, borderless, movable, resizable, and locks to the device's effective orientation. Confirmation closes the overlay before persisting/starting capture. |
| Rear-view purpose + config (RearViewConfig capture x/y/w/h + idle mode) | `devices/*` PurposeConfig; React Devices rear-view | **Done (core)** | WS7 | P2 | WS7/US30 | Per-device physical desktop coordinates persist (including negative multi-monitor positions); Devices provides Select/Change area and an honest Setup-needed state. Idle-frame modes remain deferred. |
| Device catalog (addable entries, generic→scan, embedded presets) | `devices/catalog.go` | Partial | WS5/WS7 | P1 | WS5/US22 | .NET Catalog loads presets and preserves offset/margin/bindings; generic→USB-scan path missing. |
| Device add/scan bridge (generic scan, picker, auto-rotate) | `app/app_dashboard.go`/`app_hardware.go` Device* | Done (core) | WS7 | P1 | WS7/US31 | Catalog entries and screen service coordination exist; generic USB picker polish remains deferred. |
| Device management bridge (rename/rotation/offset/layout/purpose/status) | `app.go` Device* setters | Done (core) | WS5/WS7 | P1 | WS5/US22 | Runtime persists rename/rotation/offset/margin/layout and screen service status is surfaced. |
| Device list UI grouped by type w/ live status | React `Devices.tsx`, `DeviceSection.tsx` | Done (core) | WS7 | P1 | WS7/US31 | Device cards show status and controls for the migrated screen service path. |
| Device detail UI (rename/orientation/position/dash-assign/enable) | `DeviceDetail.tsx` | Done (core) | WS7 | P1 | WS7/US31 | Orientation/position/dash assignment and enable/remove controls are represented in the Avalonia UI. |
| Screen status & events (`devices:updated`, `screen:connected/disconnected`) | `devices/events.go`, `status.go` | Done (core) | WS7 | P1 | WS7/US31 | Screen service status updates drive the device surface without Wails events. |

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
(`dotnet test`; Makefile + CI updated to `dotnet test app/Sprint.Desktop.slnx`);
clean restore/build incl. `-warnaserror` + tests (4/4) verified.

**DONE (2026-06-29, WS3 session):** the **headless Avalonia harness** is in —
`Avalonia.Headless` 12.0.5 + `HeadlessShellTests` build/show/close `MainWindow`
under a real Avalonia context (drives `HeadlessUnitTestSession` directly; the
`.Headless.XUnit` package is incompatible — xunit v3 vs our v2).

**DEFERRED / out-of-scope:**
- **Structured multi-sink logging** (matrix 4.9) remains deferred until there is
  a concrete sink/retention requirement. The telemetry engine and hardware seams
  already expose user-visible failure state without depending on the old Go
  logging design.

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
- Engineer **transport + polymorphic Payload decode** beyond the desktop contract
  shapes remains deferred to a future web/API integration slice. The desktop
  staging model and command builders are implemented.
- Atomic-publish is honored by the off-thread telemetry engine, but the contract
  remains behavioral rather than type-enforced.

### WS4 — Real Game Adapter Slice (Le Mans Ultimate)

**Goal:** Implement LMU as the first real telemetry adapter end-to-end; keep Demo
dev/test only.

**Status (updated 2026-07-04): done for the software gate.** The LMU adapter
(parser + mapper + Windows shm provider), the `CreateSource(descriptor)` factory,
the consumer-side `TelemetryEngine` (background reader thread, 5s reconnect/probe
loop, ~30Hz buffered latest-value handoff, real-rate measurement) and the
non-mutating `DeltaTracker` all landed and are covered by deterministic tests.
**Deferred for physical/live sign-off:** a GUI run against a running LMU, Linux
`/dev/shm`, and product-level selected-game UX beyond the current factory/default.

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

**Status (updated 2026-07-04): done for the core parity gate.** The reachable
.NET renderer path is painter-backed: `DashPainter` renders the known/default
and critical widget subset, `DashImageRenderer` bridges those pixels into
Avalonia previews, and hardware screen services consume the same painter path.
The old test-only render-plan preview seam was removed. The editor reducer seam
also landed:
`DashLayoutEditor.TryMoveWidget`,
`TryResizeWidget`, `TryDeleteWidget`, `TryClearPage`, `TryAddWidget`, `AddPage`,
`TryRenamePage`, and `TryDeletePage` cover grid geometry, overlap checks, widget
placement/deletion, page clearing, and regular-page management. The Dashes page
now wires custom-layout Add page through the reducer and `SaveDashLayout`.
Headless editor-view tests cover click selection, drag-move, resize clamping,
and resize collision rejection through the real Avalonia pointer path, plus a
`VisualSmokeTests` editor scene and a mid-drag ghost scene. Move/resize render a
live snapping ghost (dashed ember, valid/invalid tint via `CanPlaceWidget`), and
the palette is a Figma-styled panel (header, search, category cards). Full
widget-stack/theme-manager/config breadth and palette drag-place are tracked
deferrals.

**DEFERRED / out-of-scope:**
- Full legacy widget-stack, theme-manager, style/color-expression, and
  config-driven widget catalog parity.
- Throttle cache, optical centering, inherited-override clearing, and palette
  drag-place (click-to-add + live move/resize ghost are implemented).
- In-browser HTML/CSS `WidgetPreview` is dropped in favor of native
  painter-backed previews.
- Page-cycle dynamic commands span into deferred WS8/page-stack follow-up work.

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
- Live VoCore/USBD480 verification, generic USB picker polish, and WinUSB `.inf`
  installer/UAC flow remain hardware-gated.
- Rear-view idle frames (black/pixel clock) remain P2; live desktop capture and
  its in-app region selector are implemented.
- Linux (gousb and desktop capture) hardware paths are out of scope for the
  Windows-first migration.

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
- Real engineer↔web sync transport (beyond contract shapes) remains deferred; the
  old desktop surface had no active consumer.

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
- Self-replacing auto-install is intentionally deferred; the migration decision is
  check + notify + manual download.
- Code signing certificates / process need maintainer/infra input.

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
- Live LMU, physical VoCore/USBD480 output, physical joystick capture, signing,
  and portable-data-location policy require hardware or maintainer decisions.

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

**Cross-cutting:** keep seams pure and dependency-injectable (the
`DesktopRuntime` dataRoot/presetRoot pattern is the model). The old hand-rolled
console runner has already been replaced by xunit.

---

## 7. Open questions / risks

| # | Topic | Risk / decision needed | Owning WS |
| --- | --- | --- | --- |
| 1 | **Dash painter port strategy** — RESOLVED 2026-07-01 | Chosen: **SkiaSharp** (`DashPainter`), pinned to the exact version Avalonia already resolves. Renders off the UI thread to a BGRA buffer that feeds the on-screen preview (`DashImageRenderer`), PNG thumbnails, and hardware RGB565 alike. The Go runtime element-DSL (ColorExpr/Condition/widget-stacks/per-widget cache) was NOT ported — the fixed critical-widget set uses direct per-type renderers; richer config-driven widgets remain a deferred WS6 row. | WS6 |
| 2 | **Shared-memory interop in .NET** | LMU reads a named shared-memory region with a packed `_pack_=4` binary layout (`MemoryMappedFile` + `Marshal`/`Span` struct reads). Field-alignment fidelity is parity-critical; needs captured frames to validate. | WS4 |
| 3 | **WinUSB in .NET** | Go used native WinUSB (no CGO/libusb) + SetupDI enumeration + `pnputil` install. .NET has no CGO equivalent — P/Invoke to WinUSB/SetupAPI, or a managed USB wrapper? Affects VoCore/USBD480 + driver install. | WS7 |
| 4 | **Windows Raw Input in .NET** | HID button/encoder capture used an OS-thread message loop + HidP APIs. Porting requires a hidden message window + P/Invoke; threading model must stay off the UI thread. | WS8 |
| 5 | **Updater: port, replace, or drop** — RESOLVED 2026-07-01 | Decision: **check + notify + manual download**. `UpdateChecker` (channel-aware semver, unit-tested) + `GitHubReleaseSource` power a manual "Check for updates" in Settings and a version badge; the Windows-batch **self-replacing auto-install is intentionally deferred** (risky unattended, and out of scope for this parity pass). See `docs/RELEASE.md`. | WS10 |
| 6 | **Design typography** — RESOLVED 2026-06-29 | Maintainer confirmed `docs/Sprint.fig` mandates **Inter** (UI) + **Space Grotesk** (display). Design layer migrated off `IBM Plex Sans`: fonts bundled under `Sprint.Desktop.Client/Assets/Fonts`; `Graphite.FontStack`/`DisplayFontStack` + `docs/DESIGN.md` updated; build-verified. Remaining: render-verify on a GUI run + full component fidelity to the Figma (WS6). | WS6 |
| 7 | **Telemetry threading model** — RESOLVED 2026-06-30 | `TelemetryEngine` owns the background reader, cancellation/disposal, 5s reconnect loop, ~30Hz buffered handoff, real measured Hz, and non-mutating delta augmentation. | WS4 |
| 8 | **SDK availability / build verification** — RESOLVED 2026-06-29 | `global.json` pins the .NET **10.0.301** SDK. On this Windows machine the SDK may resolve under the x86 host `C:\Program Files (x86)\dotnet`; use it explicitly if the x64 `dotnet` on PATH has only a runtime. | WS2 |
| 9 | **Portable data location** | Old app stored `data/` next to the exe (portable); .NET uses `%AppData%/Sprint` but now probes `AppContext.BaseDirectory/data` for one-time device/layout migration. Product decision still needed for whether new writes should remain in AppData or return to portable mode. | WS5 |
| 10 | **"AI improvements" scope undefined** | The maintainer explicitly wants "some AI improvements," but PRD #107's workstreams (1–11) define none. Surface (engineer assistant? setup advisor? telemetry insights?), model, data flow, and on-device vs API are **all unspecified** — needs a dedicated mini-PRD / maintainer input before any agent plans against it. Treat as a separate workstream (WS12), not folded into the migration. | (unassigned / WS12) |
| 11 | **Model-fidelity data loss is silent** | The main WS5 lossy fields are modeled/preserved, including dash idle/alerts/config, settings dashEditorUI, device geometry/bindings, and unknown dash/widget extension data. Remaining fidelity risk lives in intentionally deferred WS6 schema areas such as widget stacks/theme/format semantics. | WS5/WS6 |
| 12 | **Test runner** — RESOLVED 2026-06-29 | `Sprint.Desktop.Tests` uses xunit + `Microsoft.NET.Test.Sdk`; CI and `make test-app` run `dotnet test`. | WS2 |
