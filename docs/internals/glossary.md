# Glossary

Shared vocabulary. Use these words in code, UI copy and issues; a second word for the same thing
splits searches and confuses the next agent.

## Telemetry and games

- **Telemetry frame** — `TelemetryFrame`, the one game-agnostic snapshot every consumer reads.
- **Game provider** — `IGameProvider`: a game's descriptor, telemetry source and optional
  capabilities (`Results`, `Setups`, `Schedule`). A `null` capability means the game cannot do it.
- **Link state** — the telemetry connection state shown in the title bar, including `Stale` when frames
  stop arriving.

## Desktop process

- **Host** — `Sprint.Desktop.Host`, the headless .NET process Electron launches.
- **Bridge** — `app/desktop/src/bridge.ts`, the renderer's only data access.
- **Command** — a validated `RuntimeCoordinator` action, e.g. `plan.arm`, `dash.page.next`. Also what a
  wheel button or key binding triggers.

## Dashes and devices

- **Dash** — a `DashLayout`: pages of widgets for one screen profile. Not "dashboard" in code.
- **Page** — one screen of a dash; the **idle page** shows when no session runs.
- **Widget** — one catalog element on a page. A **widget stack** layers widgets in one cell.
- **Binding** — a named value a widget reads (`lap.delta`, `target.fuelPerLapLiters`).
- **Preset** — a shipped dash, device or setup template under `app/Sprint.Desktop.Host/presets/`.
- **Theme preset** — a complete dash color theme. **Functional** is the default condition palette;
  **Styled** remaps it except protected colors. Internal classification, not an editor mode.
- **Condition** — what a dash color means: Neutral, Good/OnTarget, ColdLow, AssistActive, Warning,
  Critical, Fault, RaceControl.
- **Device** — a saved wheel or screen entry. Its **screen** is the physical panel.
- **Purpose** — what a device's screen shows: `dash`, `rear-view-mirror`, `flags`, `lap-times`.
- **Native size** — the panel's physical pixel size; **logical size** is the size the dash is laid out
  at before rotation.

## Planning and analysis

- **Plan** — a `SessionPlan` for one event; **segment** — its qualifying or race run.
- **Active slot** — the single Armed/Tracking plan.
- **Quick plan / planned plan** — `PlanMode`; quick plans are built from detection under time pressure.
- **Corpus** — the lap-history store; every recorded and imported lap.
- **Context** — the corpus key: game + track course + car model.
- **Tier** — what a lap can drive: `full trace`, `reference curve`, or `time only`.
- **Reference curve** — position→time per lap (`LapReferenceCurve`), the cheap tier.
- **Channel trace** — `LapChannelTrace`, named channels on a ~2 m grid, the detailed tier.
- **Target** — what a plan aims at per segment kind, chosen as **scope** + **statistic**.
- **Latch** — applying a changed target only at the start/finish line.
- **Live Compare** — comparing the live lap against a target lap's trace; its **HUD** is the overlay
  windows above the game.
- **Share code** — an unguessable, revocable code that pulls one shared lap.

## Race engineer

- **Engineer** — a remote person viewing live data and sending commands; the driver's app stays
  authoritative and applies or rejects them.
- **Staged change** — an engineer edit not yet pushed; **push** sends staged changes to the car.

## Design

- **Glance** — readouts consumed in a moment (wheel, KPIs). Their rules are in
  [`docs/design/DESIGN.md`](../design/DESIGN.md#glance-readouts).
- **Primary** — the one brand-colored action per view.
