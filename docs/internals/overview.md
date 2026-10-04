# Architecture

Sprint reads live telemetry from a sim on the driver's PC, renders a dash onto USB wheel screens,
and keeps planning, analysis and setups locally. A cloud API and web app hold shared data. Module
ownership is in [`AGENTS.md`](../../AGENTS.md#module-boundaries); this page records why the pieces
are split the way they are.

```
Sim (LMU shared memory)
  -> Sprint.Games adapter -> TelemetryFrame (Sprint.Desktop.Api)
  -> Sprint.Desktop.Core (telemetry engine, planner, recorder, devices, USB)
  -> Sprint.Desktop.Host  (loopback HTTP, bearer token)
  <-> app/desktop         (Electron main + React renderer + offscreen dash browsers)
  -> api/ (GraphQL, Postgres + InfluxDB) <-> web/ (Next.js)
```

## The telemetry contract is the spine

Game-specific data is mapped into `TelemetryFrame` at the edge (`app/Sprint.Games`). Everything
downstream — dash, hardware, planner, recorder, engineer, UI — depends only on that contract, so a new
game is one `IGameProvider` and nothing else changes. Provider capabilities (`Results`, `Setups`,
`Schedule`) are optional; `null` means "this game cannot", and the UI hides the entry point rather than
offering an action whose only answer is "unsupported". The contract is mirrored in `packages/types`;
a change to one is a change to both.

Things that describe a plan rather than a car (targets, planned fuel) do not go on the frame. See
[session-planner.md](session-planner.md#target-delivery-to-the-wheel).

## Native host, web UI

There is no native UI. All behaviour lives in `Sprint.Desktop.Core`, which references no UI framework.
`Sprint.Desktop.Host` is a thin adapter: validated JSON in, Core calls, JSON out. The Avalonia client and
the Go/Wails app before it are retired; do not reintroduce either.

- Electron launches the host with a random bearer token. The host binds `127.0.0.1:0` and prints one
  `{ "type": "ready", port }` line on stdout — which is why the host never echoes logs to stdout.
- The token stays in the main process. Renderer windows are sandboxed with context isolation and talk
  to the host only through the preload bridge.
- Every user action is a validated command in `RuntimeCoordinator` (`POST /api/commands`); large or
  async payloads get a focused endpoint. A button whose command the host does not handle is a bug.
- The renderer reads state from one subscription in `App.tsx` via `bridge.ts`, which narrows host JSON
  once. Views render and raise intent; they never fetch.
- Enums cross the wire as names. A new host enum member needs the matching union member in `bridge.ts`.
- All assets and fonts ship locally; the app works offline.

## One renderer, two native looks

The desktop wears the look of the OS it runs on: Fluent on Windows (and Linux, which has no look of
its own), macOS on a Mac. The main process decides (`windowLook` in
[`electron/windowChrome.ts`](../../app/desktop/electron/windowChrome.ts)) and passes
`?platform=mac|windows`; the renderer reads it once and sets `<html data-platform>`. One bundle
serves both.

- `@sprint/tokens/macos.css` is an overlay on `windows.css` under the same names, so `styles.css`
  reads Mac values without knowing about them. `macTokens.test.ts` fails when a token lands in only one
  file.
- Mac shapes live in `app/desktop/src/styles.mac.css`, every rule under
  `:where([data-platform="mac"])`. `:where()` adds no specificity, so each rule wins only by loading
  after `styles.css`, and view CSS (loaded later still) keeps winning on both platforms. That scoping
  is also the Windows guarantee: without `data-platform="mac"`, Windows renders exactly
  `styles.css`. Raising the specificity of a Mac rule breaks view overrides on Mac only.
- The main process cannot read CSS, so `windowChrome.ts` repeats the colours it paints natively:
  `--mica`/`--label` for the Windows caption buttons, the opaque `--sidebar` for macOS with Reduce
  Transparency on. Change a token there too.
- The traffic lights are positioned in `main.ts` (`TRAFFIC_LIGHT_POSITION`) against renderer
  geometry: 14px buttons centred on the 52px toolbar band (y = 19), ending at x = 76 inside the 80px
  the sidebar band reserves (and the toolbar pads for while the sidebar is hidden). Change one side,
  change the other.
- macOS keeps a standard app menu ([`electron/appMenu.ts`](../../app/desktop/electron/appMenu.ts)):
  Quit, Hide and copy/paste in text fields route through it. The app's own shortcuts (⌘K, ⌘1…7, ⌘[)
  stay in the renderer (`shell/shortcuts.ts`) and must not become menu accelerators.
- Page actions reach the Mac toolbar through one seam: `TitleBar` hands up a slot and a function
  that measures the toolbar's room on the spot, `App` provides both as `ToolbarActionsContext`, and
  `PageHeader` portals its CommandBar into the slot
  ([`shell/toolbarActions.ts`](../../app/desktop/src/shell/toolbarActions.ts)). Whether the actions
  fit is the pure rule in [`shell/actionsPlacement.ts`](../../app/desktop/src/shell/actionsPlacement.ts)
  (with hysteresis, so a window at the boundary does not bounce them). The room is counted with the
  telemetry indicator already at its dot, so the indicator shrinks before actions leave. Room and
  width are read together before paint on every render and whenever the bar resizes; a stored
  width goes stale after navigation or a label change. The content fallback row is drawn with the
  same toolbar-item styles (`.toolbar-items`), so its width there is its toolbar width.
  The toolbar restyles actions by structure, so views keep writing the plain CommandBar: a
  `.button.subtle` with a leading icon turns icon-only (the shell sets its tooltip from the label
  and appends a view's own `title`), and nothing is reordered (Tab order is the visual order). A
  subtle button without an icon, a hand-made toolbar or a per-platform branch in a view breaks
  that. Once portalled, the CommandBar is no longer inside the view's DOM, so view CSS scoped to the
  view does not reach it on Mac.
- The Mac scroll edge is CSS only: `.content` names its scroll timeline, `.app` hoists it with
  `timeline-scope`, and the toolbar's `::before` (a sibling of the content) fades in on it — no
  scroll listener, and nothing animates while nothing scrolls. The content spans both grid rows and
  starts below the toolbar by padding (`scroll-padding-top` keeps focused items clear of it).
  Without scroll-driven animation support the bar is always shown.
- macOS labels the Dock tile with the name in the running bundle, and `app.setName()` cannot change
  it. `make dev-app` therefore runs from `app/desktop/.dev/Sprint.app`, an APFS clone of the npm
  Electron.app with a patched `Info.plist` and the Sprint icon
  ([`scripts/dev.mjs`](../../app/desktop/scripts/dev.mjs)). Its executable keeps the name
  `Electron`, which keeps `app.isPackaged` false (dev behaviour, no updater).
- The Mac icons are generated, committed artwork:
  [`scripts/icons/make-mac-icon.mjs`](../../app/desktop/scripts/icons/make-mac-icon.mjs) renders
  `resources/icon-mac.png` (the dev `app.dock.setIcon`, shown unmasked) and `resources/icon.icns`,
  both already shaped to Apple's icon grid (824px body on 1024), because macOS 26+ shrinks a legacy
  `.icns` that does not fit that shape into a grey tile. A proper Icon Composer `resources/icon.icon`
  needs `actool`; packager compiles it automatically when the file exists.

## The frame path

telemetry → dash DOM → Electron offscreen paint → raw BGRA → host → RGB565 → USB.

The same `packages/dashboard` component drives the editor preview, the on-screen display and the USB
output, so what the editor shows is what the wheel shows. No PNG, JPEG or base64 on the live path; a
busy consumer keeps only the latest frame. Dash rendering continues while the main window is hidden.
Rear-view output captures a desktop region natively and never touches the dash DOM. Details:
[screen-protocols.md](screen-protocols.md), [dash-rendering.md](dash-rendering.md).

## Local data

Everything the desktop owns lives under `%AppData%\Sprint` (`~/.config/Sprint` on macOS; or
`SPRINT_DESKTOP_DATA_ROOT`): settings,
dashes, devices, setups, session plans, the lap-history corpus, lap traces, diagnostics. Stores write
one file per record where a corrupt file must not cost the rest. Persisted enums use names. Data from
the retired clients is not migrated.

## Cloud

`api/` is .NET 10 + HotChocolate GraphQL over Postgres (relational) and InfluxDB (live telemetry time
series); shared DTOs live in `app/Sprint.Contracts`. The desktop's only cloud traffic is sign-in and lap
sharing (`SprintCloudClient`) plus GitHub release checks and update downloads. Deployment: [operations/deployment.md](../operations/deployment.md).
