# Session planner and the lap-history corpus

Decisions behind the planner, the lap-history corpus, plan targets, results import and setup
capture. Code: `app/Sprint.Desktop.Core/Features/SessionPlanning/` and `Features/Setup/`, wired in
`app/Sprint.Desktop.Host/Program.cs` and `TelemetryIngestionPipeline.cs`; UI in
`app/desktop/src/views/SessionPlannerView.tsx`. Epic #8.

## Boundaries

- Planner logic is game-agnostic. It consumes `TelemetryFrame` and Sprint records only, never a
  `Sprint.Games` structure. Game data enters through `IGameProvider` capabilities, which return Sprint
  records.
- The UI depends on `SessionPlannerService` (through host commands), never on a store or files.
- Remote sync, when built, is a new `ISessionPlanStore` / `ILapHistoryStore` implementation. Plans
  and targets are plain serialisable data; targets are intent, so last write wins.

## Plans

- Lifecycle `Draft → Armed → Tracking → Completed` (or `Abandoned`). Only one plan may hold the
  active slot (Armed/Tracking). A plan left `Tracking` by a crash is demoted to `Abandoned` on the next
  start so the slot never wedges.
- `PlanMode { Planned, Quick }` is persisted, not derived: a quick plan's inputs carry lower confidence
  and that must stay visible after creation. `Planned` is the first member so plan files written before
  modes existed keep their meaning.
- Name is optional; the derived name (`Track – Car`) is shown as the placeholder and is exactly what
  the plan gets.
- Race length comes from the lap count, else a plausible total session time, else the user is asked.
  A garbage duration would quietly become a garbage fuel estimate.
- Context fields offer what Sprint has recorded (`PlanContextOptions`) but stay free text. The corpus
  is keyed on exact strings, so a typed "Spa Francorchamps" next to a recorded "Spa-Francorchamps"
  splits the data; a closed list would make planning for an undriven car impossible.
  `ILapHistoryStore.LoadContexts()` reads only the context objects so listing options does not
  materialise every lap's curve.
- Exactly one primary action: the next step (`SessionPlannerController.NextSegment`). Starting the race
  while a planned qualifying has not run asks first.

## The lap-history corpus

Separate from plans: plans are a short list made on purpose, the corpus grows to hundreds of sessions.
Two writers (the live recorder, the results importer), one reader. One JSON file per session under
`%AppData%/Sprint/lap-history/`, so a corrupt file costs one session.

- **Context key is `game` + `trackCourse` + `carModel`.** Track length is stored beside it as a
  cross-check; car class is metadata so a "same class" fallback stays possible. Both writers must map
  onto exactly these fields or one real context splits into two buckets that never join. A test runs a
  live frame through the LMU mapper and recorder, imports XML into the same store, and resolves
  statistics over both — keep it passing.
- `HistorySessionKind` is an on-disk enum, deliberately not the telemetry contract's `SessionType`, so
  a contract rename cannot change how stored history deserialises.
- **The recorder is always on**: every session type, practice included, plan or no plan. Not recording
  is unrecoverable; filtering later is cheap. Persistence goes through a dispatcher so a slow disk
  never stalls the telemetry read, and a store failure is logged, not propagated.
- Every qualifier (conditions, fuel, energy, tyres, program tags) is nullable. Imports can never supply
  them, so filtering on them would discard imported laps. Usage is measured between crossings: the
  first lap has none and a refuel yields `null`, never a negative.
- Virtual energy is recorded beside fuel: an LMU hypercar stint is energy-limited as much as
  fuel-limited.
- The recorder, the importer and the planner share one store instance (host composition), so a
  recorded lap is visible on the next state poll. `CachingLapHistoryStore` exists for repaint-heavy
  readers; if it is put in front, it must be that one shared instance — it drops its cache on write,
  and a second instance would let the corpus change behind it.

### Reference curve and channel trace

- `LapReferenceCurve` is position→time at 0.5 % of a lap (201 points, ~3.2 KB). Only times are stored;
  position is `i * PositionStep`, serialised per instance. Its on-disk shape must not change — every
  target, thumbnail and delta depends on it. A test caps it at 4 KB/lap.
- A partial lap gets no curve rather than a misleading one: ≥ 8 samples, first ≤ 0.2, last ≥ 0.8, and
  no interior gap over 5 % of the lap. Invalid laps still get curves; validity is a selection rule.
- `LapChannelTrace` is a second, detailed tier (named channels on a ~2 m grid) stored apart from the
  session JSON — see [live-compare.md](live-compare.md).
- Tier is a property of the lap, not the session: `full trace` / `reference curve` / `time only`.
  Imported laps have no curve and degrade honestly to scalar targets.

## Statistics and targets

- The statistic is the **median**, never the mean — the corpus is full of traffic laps and offs. It is
  always shown with its sample size.
- Every preset resolves to a real, driven lap (the lower median on even counts). A synthetic time has
  no per-corner pace and so no curve.
- Targets are stored per `SegmentKind` on the plan, not on `PlanSegment` (which holds actuals and does
  not exist at planning time). A target is (scope, statistic): scopes `Current Quali` (labelled with its
  session timestamp — no silent recency cutoff), `Quali`, `Practice`, `Practice program`; statistics
  `Fastest`, `Median`, `Slowest`, `Specific`.
- `Specific` opens a scrollable list of every lap, never a dropdown. There is no typed lap-time entry:
  a lap time is something a car did. Stored `Manual` targets still deserialise.

## Target delivery to the wheel

`PlanTargetDelivery` splits by what each target physically needs:

- The chosen lap's curve becomes the `DeltaTracker` plan reference, so `lap.delta` / `lap.target`
  measure against that lap. No telemetry contract change: a position-relative delta can only be
  computed inside the tracker. The plan curve is held apart from the session best, so clearing the
  target restores the comparison underneath.
- Scalars (lap time, planned fuel per lap) arrive as `DashTargets` on `DashBindingContext`, exposed as
  `target.*` bindings. Putting them on `TelemetryFrame` would make every adapter and `packages/types`
  carry fields describing a plan, not a car.
- **Everything latches at the start/finish line.** `PlanTargetDelivery.Observe` applies a pending target
  at the lap increment (or immediately when there is no lap to protect). A target that flips mid-lap
  would measure a lap against something it was never driven with. It fires on every boundary so a
  tracker that dropped state recovers one lap later. The UI says "Applies from the next lap".
- Scalar-only targets never fake a delta: a curve-less lap leaves the tracker on its own session best.
- **Absent is not zero.** Unset `DashTargets` members resolve to absent and widgets show no-data.
  `fuel_target` binds to the planned value, not actual consumption — a target that follows the burn
  can never be missed.

## Results import

- XML is an import path, never a query path. No game-native type escapes the importer.
- The importer keys on `TrackCourse` (the layout, never `TrackVenue`) and `CarType` (the model).
  `LeMansUltimateGameData.GameName` is the single constant both writers stamp. A file that cannot be
  keyed is skipped and logged rather than filed where the recorder can never join it.
- **Idempotency is the id**: `imported-{game}-{course}-{kind}-{timestamp}-{player}`, slugged. No hashing.
  A moved results folder costs one re-parse and zero duplicates.
- `ResultsImportLedger` records path + size + last-write for imported **and** declined entries, so a
  launch with nothing new opens no files. Declined is separate from imported; manual entry points scan
  with `includeDeclined: true`.
- The startup prompt shows a per-kind breakdown and writes nothing until answered — silent import
  would put hundreds of untraceable sessions behind every figure. Every outcome resolves inside the
  dialog, never as a toast. Import entry points are absent for a game whose provider has no `Results`.
- What the archive never states (fuel, energy, conditions, setup, curve) stays null. Untimed laps are
  dropped rather than written as zero.

## Setups

- `.svm` values are the sim's indices, stored verbatim. Rendering "rear wing = 7 clicks" needs vehicle
  data the file does not carry, so nothing pretends to.
- `ISetupRepository.WatchRoot` is a path, not a change event: the host owns the one watcher and calls
  `ListSetups()` again, so repositories stay pure readers.
- Capture dedupes by content digest. Promotion into the vault is an explicit user action.
- Association proposes the most recently modified setup matching car and track and shows observed vs
  stated brake bias; the driver decides. `SetupReference` has three states: `null` (not asked yet),
  `"unknown"` (asked, unidentifiable — never re-guessed), or a snapshot id.
- Writing is export only, to a location the user picks; the game directory is never touched.

## Settings

`AppSettings.SessionPlanner` holds planner defaults, rendered behind the gear in the planner's own
header — features own their defaults; the global Settings page holds app-level preferences only.
Defaults seed new plans and never lock them. Enums persist by name (`JsonStringEnumConverter`) so
reordering members cannot change stored meaning.

## Deliberately open

- Practice programs (`PACE`, `QUALI`) — only the corpus tags are settled.
- Setup variant lineage — parent links, diff presentation, naming.
- Fuel calculator (#50), online detection (#102), stint-lap targets.
- Declarative dash condition rules (#159) and a `lap_summary` alert.
- LMU weekly schedule feed — see [lmu-schedule-feed.md](lmu-schedule-feed.md).
