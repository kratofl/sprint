# Glossary

Shared vocabulary. Use these words in code, UI copy and issues; a second word for the same thing
splits searches and confuses the next agent.

## Telemetry and games

- **Telemetry frame** — `TelemetryFrame`, the one game-agnostic snapshot every consumer reads.
- **Game provider** — `IGameProvider`: a game's descriptor, telemetry source and optional
  capabilities (`Results`, `Setups`, `Schedule`). A `null` capability means the game cannot do it.
- **Link state** — the telemetry connection state shown in the toolbar, including `Stale` when frames
  stop arriving.

## Desktop process

- **Host** — `Sprint.Desktop.Host`, the headless .NET process Electron launches.
- **Bridge** — `app/desktop/src/bridge.ts`, the renderer's only data access.
- **Command** — a validated `RuntimeCoordinator` action, e.g. `plan.arm`, `dash.page.next`. Also what a
  wheel button or key binding triggers.

## Dashes and devices

- **Dash** — a `DashLayout`: pages of widgets for one screen profile. Not "dashboard" in code.
- **Page** — one screen of a dash; the **idle page** shows when no session runs.
- **Dash rule** — a device's (or every device's) pick of a dash for a game, class or car
  (`DeviceDashRules`); Devices > Output and the designer's "Use here" set them.
- **Variant** — a dash's own version for a device, game, class or car (`DashVariants`): part of
  the dash, never a dash in the list. The host draws the most specific one matching the screen and car
  after the rules picked the dash; the renderer never sees the rest. The designer makes one on the
  first change in a scope that had none (`designer/variants.ts`), so picking a scope changes nothing.
- **Widget** — one catalog element on a page. A **group** gathers widgets and groups; one that
  shows "one at a time" is a **widget stack**, each child a **layer** (`packages/dashboard/src/groups.ts`).
- **Binding** — a named value a widget reads (`lap.delta`, `target.fuelPerLapLiters`).
- **Preset** — a shipped dash, device or setup template under `app/Sprint.Desktop.Host/presets/`.
- **Colour theme** — the driver's app-wide choice of what cold and good look like (Sprint, Calm,
  Strict), with the **colour limits** where values change; shared by dashes, the pit wall and Analysis.
- **Condition** — what a dash color means: Neutral, Good/OnTarget, ColdLow, AssistActive, Warning,
  Critical, Fault, RaceControl.
- **Device** — a saved wheel or screen entry. Its **screen** is the physical panel.
- **Browser display** — a dash device with no USB link, shown by any browser or VR overlay tool on
  this PC ([browser-displays.md](browser-displays.md)).
- **Scene** — what the dash renderer draws besides the telemetry frame: layout, page, idle, logical
  size, driver name and number, plan targets (`DashSceneContent`).
- **Purpose** — what a device's screen shows: `dash`, `rear-view-mirror`, `flags`, `lap-times`.
- **Native size** — the panel's physical pixel size; **logical size** is the size the dash is laid out
  at before rotation.

## Planning and analysis

- **Plan** — a `SessionPlan` for one event; **segment** — its qualifying or race run.
- **Active slot** — the single Armed/Tracking plan.
- **Quick plan / planned plan** — `PlanMode`; quick plans are built from detection under time pressure.
- **Corpus** — the lap-history store; every recorded and imported lap.
- **Context** — the corpus key: game + track course + car name (`CarNames`: "Hypercar BMW", "LMP2 ELMS").
- **Tier** — what a lap can drive: `full trace`, `reference curve`, or `time only`.
- **Reference curve** — position→time per lap (`LapReferenceCurve`), the cheap tier.
- **Channel trace** — `LapChannelTrace`, named channels on a ~2 m grid, the detailed tier.
- **Target** — what a plan aims at per segment kind, chosen as **scope** + **statistic**.
- **Latch** — applying a changed target only at the start/finish line.
- **Live Compare** — comparing the live lap against a target lap's trace; its **HUD** is the overlay
  windows above the game.
- **Lap file** — a `.sprintlap` file holding one lap's trace and its provenance; the only way a lap is
  shared. A lap that arrived as one is a **shared lap**.

## Race engineer

- **Engineer** — an account a driver linked through an **invite link**; sees all the driver's sessions,
  live and past, minus **exclusions**. The driver's app stays authoritative.
- **Invite link** — single-use, 7-day, revocable link that makes whoever accepts it the driver's
  engineer.
- **Exclusion** — the driver hid one session from one engineer.
- **Session key** — the desktop's own session id; joins a session's live stream, InfluxDB data, synced
  row and exclusions.
- **Live session** — a session the desktop is streaming right now; viewers get it over SSE.
- **Sign-in ticket** — the single-use code a Discord sign-in ends with, traded for a JWT.

## Design

- **Glance** — readouts consumed in a moment (wheel, KPIs). Their rules are in
  [`docs/design/DESIGN.md`](../design/DESIGN.md#glance-readouts).
- **Primary** — the one brand-colored action per view.
