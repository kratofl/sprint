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
`lap-history/` in the desktop data folder, so a corrupt file costs one session.

- **Context key is `game` + `trackCourse` + `carModel`.** Track length is stored beside it as a
  cross-check; car class is metadata so a "same class" fallback stays possible. Both writers must map
  onto exactly these fields or one real context splits into two buckets that never join. A test runs a
  live frame through the LMU mapper and recorder, imports XML into the same store, and resolves
  statistics over both — keep it passing.
- **`carModel` is the car's name, not the game's**: class + make ("Hypercar BMW", "LMGT3 Porsche",
  "LMGTE Ferrari"), and for LMP2 — every car an Oreca 07 — the championship ("LMP2 ELMS", "LMP2 WEC").
  One rule, `CarNames`; the recorder, the importer and the plan prefill all go through it. LMU names a
  livery live (`mVehicleName`, "DKR Engineering #3:ELMS26") and a model in its archive (`CarType`), so
  neither can be the key: a friend's lap in another livery of the same car must match. Live, the name
  comes from the telemetry block's `mVehicleModel`/`mVehicleClass`/`mVehicleChampionship` (the garage
  screen has no telemetry block and borrows them from the last cockpit frame of the same livery);
  imports from the archive's `CarType`/`CarClass`/`Category`. The model (`carType`) and the livery are
  kept beside the key as detail. A car the rule cannot name keeps the game's name.
- History filed before that rule is renamed once, at host start (`StoredCarNames`): a stored livery is
  looked up in the results archive (every entrant's `VehName` → `CarType`/`Category`, ~3 s to parse,
  only when a livery needs it), LMP2 is named by its class (`LMP2_ELMS` → ELMS, `LMP2` → WEC), an
  imported session's stored model is named directly. A context that states `carType` or `livery` is
  never looked at again, matched or not. A shared lap from an older Sprint is named the same way on
  import; plans saved before keep the livery they were made with.
- `HistorySessionKind` is an on-disk enum, deliberately not the telemetry contract's `SessionType`, so
  a contract rename cannot change how stored history deserialises.
- **The recorder is always on**: every session type, practice included, plan or no plan. Not recording
  is unrecoverable; filtering later is cheap. Persistence goes through a dispatcher so a slow disk
  never stalls the telemetry read, and a store failure is logged, not propagated.
- Every qualifier (conditions, fuel, energy, tyres, program tags) is nullable. Imports can never supply
  them, so filtering on them would discard imported laps. Usage is measured between crossings: the
  first lap of each session has none and a refuel yields `null`, never a negative.
- **A crossing waits for its lap time.** LMU's lap number (telemetry) and lap time (scoring, ~5 Hz)
  can tick over a frame apart at the line, either way round, so the crossing frame can still carry the
  lap before's time. The recorder files a lap only once a new time arrives within a second of the
  line, and drops a crossing that gets none (an out lap). Filing on the crossing frame gives every lap
  its predecessor's time.
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

- An `.svm` value is `<index>//<readable value>` (`CamberSetting=30//-1.0 deg`), stored verbatim. The
  Setups pages show the readable part (`ISetupRepository.Describe`); it is only there for the saved
  index, so another index's value cannot be shown — one reason the pages are view-only.
- The readable part is in the game's UI language when it saved (`deg`/`Grad`, `N/A`/`N/V`), so two
  setups are compared by index, not by text.
- `SetupLibrary` looks at the folder on each request (no watcher), reads only files whose timestamp
  moved, and keeps every new content as a version. Capture dedupes by content digest.
- Which setup was driven is never guessed: shared memory does not say (it does name the tyre
  compounds, which every lap records), so the driver puts a setup on a **run** in Analysis. The
  game's local web API (`localhost:6397`) would say, but it is not a published interface, so
  Sprint does not use it.
- A run is an outing (`LapHistoryRecord.Outing`): the recorder starts a new one each time the car
  leaves the garage, the only place a setup can change. In the garage means out of the car (the
  game's garage screen) or standing still in its stall (`CarState.InGarage`); rolling through the
  pit lane past the stall is not. Laps without an outing (imports, older recordings) are one run.
- Picks live in `run-setups.json` (`RunSetups`), not in the session files: the recorder rewrites
  the session it is filling from its own copy on every lap, which would drop a pick made while
  that session is still being driven.
- A pick keeps the version the file held when the run started (`SetupLibrary.VersionAt`). Leaving
  the garage makes the library look at the folder, so that version is kept even if the game
  overwrites the file before anyone opens Setups.
- `LapHistorySession.SetupReference` (null / `"unknown"` / a snapshot id) and
  `SetupAssociationService.Propose` predate runs and are not wired.
- The game directory is never written.

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
