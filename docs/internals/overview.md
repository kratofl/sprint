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

## The frame path

telemetry → dash DOM → Electron offscreen paint → raw BGRA → host → RGB565 → USB.

The same `packages/dashboard` component drives the editor preview, the on-screen display and the USB
output, so what the editor shows is what the wheel shows. No PNG, JPEG or base64 on the live path; a
busy consumer keeps only the latest frame. Dash rendering continues while the main window is hidden.
Rear-view output captures a desktop region natively and never touches the dash DOM. Details:
[screen-protocols.md](screen-protocols.md), [dash-rendering.md](dash-rendering.md).

## Local data

Everything the desktop owns lives under `%AppData%\Sprint` (or `SPRINT_DESKTOP_DATA_ROOT`): settings,
dashes, devices, setups, session plans, the lap-history corpus, lap traces, diagnostics. Stores write
one file per record where a corrupt file must not cost the rest. Persisted enums use names. Data from
the retired clients is not migrated.

## Cloud

`api/` is .NET 10 + HotChocolate GraphQL over Postgres (relational) and InfluxDB (live telemetry time
series); shared DTOs live in `app/Sprint.Contracts`. The desktop's only cloud traffic is sign-in and lap
sharing (`SprintCloudClient`) plus GitHub release checks and update downloads. Deployment: [operations/deployment.md](../operations/deployment.md).
