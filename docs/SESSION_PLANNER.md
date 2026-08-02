# Session Planner (Epic #8)

Desktop-local Session Planner / Race Weekend feature. This document tracks the
service/storage foundation and the boundaries the follow-on issues build on.

## Foundation (#99) — implemented

Location: `app/Sprint.Desktop.Client/Features/SessionPlanning`.

- **Model** (`SessionPlanModels.cs`) — Sprint-owned, game-agnostic aggregates:
  `SessionPlan` (root) with `PlanSegment`, `LapSummary`, `CaptureManifest`, and
  `PlanWarning`. Mutable JSON-friendly classes (matching `DashLayout`) so a local
  store round-trips them today and a future `RemoteStore` can write the same shapes.
- **Store boundary** (`ISessionPlanStore`) — narrow persistence seam. Local impl
  `LocalSessionPlanStore` writes one JSON file per plan under
  `%AppData%/Sprint/session-plans/`, plus an `active.json` pointer. No remote impl
  by design; the interface is the future sync boundary.
- **Service** (`SessionPlannerService`) — the frontend-facing surface:
  create/list/update/delete, the **single active-tracking slot** (only one plan may
  be Armed/Tracking), and telemetry ingestion. It consumes only the unified
  `Sprint.Desktop.Api` `TelemetryFrame` — never a `Sprint.Games` structure.
  - Lifecycle: `Draft → Armed → Tracking → Completed` (or `Abandoned`). A plan left
    `Tracking` by a crash is demoted to `Abandoned` on next startup so the active
    slot never wedges.
  - `Ingest(TelemetryFrame)` records live session type, appends a `LapSummary` per
    completed lap, and raises a one-shot `race-format-mismatch` warning. High-rate
    detailed trace capture is intentionally deferred to #101.

Tests: `app/Sprint.Desktop.Tests/SessionPlannerTests.cs` (store round-trip, corrupt-
file isolation, lifecycle, single-slot enforcement, ingestion, crash reconcile).

## Plan targets (#186) — implemented

What the driver is aiming at, stored **per `SegmentKind`** on the plan (`SessionPlan.Targets`
+ `TargetsFor(kind)`) — not on `PlanSegment`, which holds actuals and does not exist at
planning time.

- A target is a **(scope, statistic)** pair. Scopes: `Current Quali` (**with its session
  timestamp in the label**, so "the one right before the race" is verifiable — no silent
  recency cutoff), `Quali`, `Practice`, and `Practice program` (hidden in Quick mode).
  Statistics: `Fastest`, `Median`, `Slowest`, `Custom` (a specific lap), each label carrying
  its resolved time and sample size.
- `PlanTargetResolver` is the Avalonia-free seam; it narrows the corpus per scope and hands
  each slice to `LapHistoryStatistics`, so the median/real-lap rules stay defined once in #184.
- **Tier comes from the lap, not the session**: `LapHistoryRecord.HasReferenceCurve`, because
  a recorded lap whose trace failed the completeness guards has no curve either. Surfaced as
  `reference curve` / `time only` in every label and persisted on the target.
- **Three honest empty states**: a scope with no laps is omitted rather than shown empty; no
  scopes at all shows the manual row with "No laps recorded for this car and track yet"; no
  stored target says the dash gets none for that segment.
- Targets are plain serialisable data (sync-ready, last write wins). Delivering them to the
  wheel is #189, below.

**Wiring note:** `MainWindow` builds one `CachingLapHistoryStore` over the local store and
gives it to **both** the recorder and the controller. The page reads the whole corpus on every
repaint and repaints at 1 Hz while tracking, so an uncached read would deserialise every
history file — reference curves included — once a second. The cache is dropped on write rather
than patched, and sharing one instance is what makes a recorder write invalidate the page's
view; two stores would let the corpus grow behind the cache's back.

## Setup capture and session association (#188) — implemented

- **`LmuSetupRepository`** implements the #180 `Setups` capability over
  `UserData/player/Settings/**/*.svm`, returning Sprint records. Values are the sim's
  **indices**, stored verbatim: rendering "rear wing = 7 clicks" needs vehicle data the file
  does not carry, so nothing pretends to.
- **`ISetupRepository.WatchRoot`** is the one member #188 added. A change *event* would put a
  watcher's lifetime, threading, debounce and re-scan policy behind what is otherwise a pure
  reader, and force every future game to own one; a path is data, so the host runs one watcher
  and calls `ListSetups()` again when it fires — which is also what keeps the repository
  drivable from a test with no filesystem events.
- **`SetupCaptureService`** snapshots on change and **dedupes by content** (a content digest
  id, so an identical re-save adds nothing and a single changed click adds one version).
  Promotion into the vault stays an explicit user action.
- **`SetupAssociationService`** proposes the most recently modified setup matching car and
  track and carries the observed vs stated brake bias for the driver to judge — it *displays*
  the plausibility check rather than deciding on it, because converting an index to a fraction
  needs vehicle data the `.svm` does not contain.
- **`SetupReference` has three states**, not two: `null` (nobody asked yet — may still be
  asked), `"unknown"` (asked and unidentifiable — never re-guessed), or a snapshot id.

**Not done in this issue:** the confirmation dialog and its screenshots, and the watcher
itself. Both need a host trigger the ticket leaves unbuilt, and wiring capture into the
runtime would make the headless UI review scan a real game install. Export is #190.
## Target delivery to the dash (#189) — implemented

`PlanTargetDelivery` carries the active plan's targets to the wheel. **Delivery splits by what
each target physically needs**, which is why there are two routes and not one:

- The chosen lap's **reference curve** becomes a `DeltaReference` and is pushed into
  `DeltaTracker` (`SetPlanReference`), so `lap.delta` / `lap.target` measure against *that lap*
  instead of the session best. **No telemetry contract change**: a position-relative delta can
  only be computed inside the tracker, and it is the tracker that already holds the trace.
  The plan curve is held apart from the auto-adopted session best rather than overwriting it,
  so clearing the target restores the comparison that was being tracked underneath.
- **Everything scalar** — lap time, planned fuel per lap — arrives as `DashTargets`, the third
  member of `DashBindingContext`, exposed as `target.*` bindings. Putting these on
  `TelemetryFrame` would force the LMU adapter, the demo source, `packages/types` and the API
  to carry fields describing a *plan*, not a car.

**Everything latches at the start/finish line.** `PlanTargetDelivery.Observe` is the only latch:
it applies a pending target at the lap-number increment — the same instant `DeltaTracker` keys
its own boundary off — and immediately when there is no lap to protect (out of the car, a new
venue or session type, the first frame of a stint). A target that flipped mid-lap would have the
rest of that lap measured against something it was never driven with. It fires on *every*
boundary rather than only on a change, so a tracker that discarded its state is back in step one
lap later. The planner card says **"Applies from the next lap"** while a plan is tracking.
`TelemetryEngine.RequestPlanReference` only carries the decision onto the reader thread; it
decides nothing about when.

**Scalar-only targets never fake a delta.** The tier is read off the lap in the corpus, not off
`PlanTarget.HasReferenceCurve` — the flag records what was true when the target was chosen, and
the lap is what is there to measure against now. An imported lap, a manual time, or a lap whose
curve is gone yields `Reference == null`, which leaves the tracker on its own session best
rather than inventing a pro-rata trace from a single number.

**Absent is not zero.** Every `DashTargets` member is nullable and an unset one resolves to
absent, so widgets show their no-data state. The `fuel_target` widget is now bound to
`target.fuelPerLapLiters` (the plan's `FuelPerLapLiters`) instead of `car.fuelPerLapLiters`,
which was *actual* consumption — a target that followed the current burn could never be missed.
With nothing planned it paints `-- L/lap`.

Stint laps and the rest of the fuel-side targets named in spec 2.5 are **not delivered yet**:
nothing computes them until #50 adds them to `PlanTargets`. Adding them is a new member on
`DashTargets` and a new binding, with no change to the latch or either route.

Tests: `app/Sprint.Desktop.Tests/PlanTargetDeliveryTests.cs`, plus the plan-reference cases in
`DeltaTrackerTests`, `TelemetryEngineTests`, `DashBindingResolverTests`,
`DashWidgetBehaviourTests`, `ScreenPipelineTests` (the wheel's frame source), and
`HeadlessShellTests.TheRunningAppDeliversAnArmedPlansTargetsToTheDash` for the shipped path.

## Chart stack (#187) — implemented

`app/Sprint.Desktop.Client/Features/Charts/`. Several charts stacked vertically over **one**
shared X-domain, with a single crosshair reading every metric at the same coordinate.

- **Pluggable domain** — track position, lap number, session time — and one domain per stack.
  Lap comparisons belong on track position: two laps drift apart in time, so on a time axis
  the same corner lands at different X positions in different charts, which destroys the
  point of a shared crosshair. Stint trends belong on lap number.
- `ChartStackController` is Avalonia-free: "cursor at 0.62 → each series reports its value
  there" is a unit test. A series that says nothing at a coordinate reports **null**, never a
  held edge value; out of range on either side is null, because clamping would state a
  measurement at a coordinate nobody drove.
- Interpolation is chosen from what the data **is** (ADR 0024): continuous telemetry is
  linear, a per-lap figure is stepped and holds rather than inventing a value between laps.
- Empty and insufficient-data panels say so explicitly — an axis pair drawn around nothing
  reads as "zero", a different claim from "nothing was recorded".
- Rendered with SkiaSharp (no new dependency), colours from Graphite tokens only.
- **No host yet.** Which metrics go in which stack, where a stack lives, zoom/pan and
  overlaying two laps are all still open, so wiring it into a page would have decided them.
  It is reviewed on its own window in the agent UI journey (`charts-stack-track-position`).

## Le Mans Ultimate results import (#182) — implemented

The corpus's **second writer**. `LmuResultsImporter` implements `IResultsImporter` over
`UserData\Log\Results\*.xml` (wrapping the existing `LmuResultsReader`/`LmuResultsParser`),
and `LapHistoryImportService` maps `ImportedSession` → `LapHistorySession` with
`Origin = Imported` and writes through `ILapHistoryStore`.

- **XML is an import path, never a query path.** The planner always reads Sprint records; no
  game-native type escapes the importer.
- **The join keys are the whole game.** The importer maps `TrackCourse` (the layout, never
  `TrackVenue`) and `CarType` (the model) onto the same context key the live recorder writes,
  with `CarClass` as metadata. This is pinned by a test that runs a synthetic live frame
  through `LmuTelemetryMapper` **and** the real recorder, imports the XML into the same store,
  and resolves `LapHistoryStatistics` over both — so if the two writers ever disagree about
  game name, course or model, that test fails instead of the corpus silently halving.
  `LeMansUltimateGameData.GameName` is the single constant both writers stamp.
- **A file that cannot be keyed is not filed.** No `TrackCourse`, no `CarType` or no player
  entry → the session is skipped and logged, rather than filed under the venue: a venue-keyed
  bucket can never be joined by the recorder, so those laps would exist joined to nothing.
- **Idempotency is the id.** The natural key *is* the corpus id
  (`imported-{game}-{course}-{kind}-{timestamp}-{player}`, each part slugged), so a re-import
  cannot write a second copy. No hashing.
- **What the archive never states stays null:** fuel, virtual energy, conditions, setup, end
  time, and the reference curve — so imported laps report `HasReferenceCurve == false` and
  degrade honestly to scalar targets. Tyres carry compound only. Untimed laps are dropped
  rather than written as a zero that would poison every median; top speed *is* carried.

### Startup scan, prompt and decline ledger (#185)

- **`ResultsImportLedger`** records path + size + last-write for entries the driver has
  imported *or* declined — the three things an importer states **without parsing**, which is
  what lets a launch with nothing new open no files at all. Declining is recorded separately
  from importing: both silence the prompt, but only one means "the corpus has this".
- **`ResultsImportScanner.Scan`** lists the archive, drops everything the ledger has answered
  for, and only then parses what is left to build the per-kind breakdown. `Scan(…,
  includeDeclined: true)` backs the manual entry points, so "Not now" silences a prompt rather
  than deciding those laps are unwanted forever.
- **The prompt shows the breakdown** (`Practice 9, Qualifying 3, Race 2`) rather than a blind
  yes/no, and nothing is written until it is answered — a silent first run would put hundreds
  of sessions behind every fuel and lap-time figure with no consent and no traceable origin.
- **Two permanent manual entry points**: `Import results` in the planner header and in the
  Settings → Session Planner section. Both are **absent** for a game whose provider returns
  `null` for `Results` (#180) — an action whose only possible answer is "this game cannot"
  should not be offered at all.
- **Every outcome resolves inside the dialog, never as a toast.** `ImportResultsController`
  drives the sheet through Searching → NothingNew / Ready → Importing → Imported / Failed. A
  toast is a transient aside that can be missed and cannot be re-read; "nothing new to import"
  and "12 sessions added" are the answer to what the driver just pressed, so they appear where
  they are looking and the sheet closes only once they dismiss the answer.
  - The manual entry point opens the sheet **first** and searches inside it with a visible
    indicator, so a press is never answered by silence.
  - The primary button shows an indeterminate indicator and refuses a second press while the
    import runs. The work has no measurable total — the archive is however many files it is —
    so a percentage would be invented.
- Scanning and importing run off the UI thread; the import writes through the same
  `CachingLapHistoryStore` the recorder uses, so the planner page sees new sessions at once.
- **A moved or restored results folder** costs exactly one re-parse pass and creates zero
  duplicates — the ledger cannot recognise the new ids, and the importer's natural key is what
  stops the pass writing a second copy. No hashing anywhere.

## Global settings (#103) — implemented

`AppSettings.SessionPlanner` (`SessionPlannerSettings`) holds the planner's global defaults,
rendered as a `Session Planner` section on the Settings page. Defaults seed new plans; they
never lock them — every value a plan stores stays overridable per plan, and
`NewPlanDraft.FromDefaults` is the seam that applies them.

| Setting | Default | Consumed by |
| --- | --- | --- |
| `FuelReserveLaps` | `1` (+1 lap) | plan creation, today |
| `FuelHistorySource` | `AllValidLaps` | #50 fuel calculator |
| `AutoDetect` | `DraftSuggestion` | #102 online detection |
| `TraceCaptureHz` | `60` (30/60/120/240 offered) | #101 trace capture |
| `TraceRetentionDays` / `TraceMaxTotalMegabytes` | `90` / `4096` | #101 trace capture |
| `WarnOnRaceFormatMismatch` / `WarnOnDetectedSegmentChange` | on | planner warnings |

`FuelHistorySource` and `AutoDetectMode` are persisted **by name**
(`JsonStringEnumConverter`), because these are on-disk settings and an ordinal would
silently change meaning if the members were ever reordered. Settings whose consumer is not
built yet are marked above rather than hidden: the issue asks for the defaults to exist now.

## Plan creation: Quick and Planned (#178, #183) — implemented

Two entry points in the page header, not a mode switch inside the sheet: `Quick plan`
(ember primary — the one used under time pressure) and `New plan…` (neutral). The design
contract scopes segmented controls to closely related *state*, and the full sheet already
carries two of them.

- **`PlanMode { Planned, Quick }`** is persisted on `SessionPlan` and `CreatePlanRequest`.
  `Planned` is first so plan files written before modes existed — which carry no `mode` key
  — keep their original meaning. A quick plan wears a `Quick plan` chip on its card, because
  its inputs carry lower confidence by construction and #102 reads that confidence.
- **`SessionPlannerController.Detect(SessionInfo)`** → `PlanDetection`: the context (live
  session first, remembered context as fallback, so the lobby case works), the race length,
  and whether history exists. `MissingFields` drives the sheet; empty means Quick mode is a
  read-only summary plus `Create`.
  - Race length comes from the lap count when there is one, else from a plausible total
    session time in minutes, else `Unknown` → the sheet asks. A garbage duration would
    quietly become a garbage fuel estimate.
- **`QuickPlanDialog`** lists only what was actually detected and shows inputs only for the
  gaps; the subtitle matches what is on screen rather than promising detected values that
  are not there. Practice-program scope is deliberately absent.
- **Name is optional and says so** (#178): the field follows the context fields, is labelled
  `Name (optional)`, and its placeholder previews `NewPlanDraft.DerivedName` — the same string
  the plan really gets. The placeholder is retargeted in place from the track/car change
  handlers, so typing is never interrupted and the caret is never lost.

### The full sheet is stepped, and its context fields suggest

**This supersedes spec §2.1's "one screen rather than a wizard".** That rationale was "the flow
runs under time pressure just before joining a server" — which is now Quick plan's job (#183).
The full sheet is for planning in advance, so it walks three short steps instead of one form
that has to be scrolled:

1. **Where and what** — game, car, track, and the optional name.
2. **Which sessions, and how long** — qualifying include/skip, race format and length.
3. **Fuel** — reserve, plus the manual estimates when there is no history.

- `NewPlanDraft.Step` holds the position (on the draft, because the modal is rebuilt on every
  change), and `TryAdvance` validates **only the current step**, so a message lands beside the
  field it is about instead of two steps away. `TryBuild` reuses the same two rules, so a value
  that passed on its own step cannot be rejected by different wording at the end. `Back` never
  validates — a half-filled field you are returning to fix must not be why you cannot move.
- The Fuel step has no disclosure toggle any more: hiding the step's whole purpose behind a
  click would be a control that only ever gets opened.
- **Game, car and track are dropdowns over what Sprint has recorded** (`PlanContextOptions`,
  from the corpus plus the live context; cars and tracks narrow to the chosen game). This is not
  cosmetic: the corpus is keyed on `game + trackCourse + carModel`, so a typed
  "Spa Francorchamps" beside a recorded "Spa-Francorchamps" is a second bucket, and every
  target and fuel figure drawn from it silently uses a fraction of the laps.
  - `SuggestingField` is a `TextBox` with a chevron and a popup list. **Not an
    `AutoCompleteBox`** — that only reveals its list after a keystroke, so it reads as a plain
    text box and the recorded spellings stay invisible, which defeats the point. **Not a
    `ComboBox`** either: a closed list would make planning for a car never driven impossible.
    Clicking the field or the chevron opens the list; picking writes both the box and the draft
    (a programmatic `Text` assignment raises no `TextChanged`).
  - The chevron and the popup exist only when there is something to offer, and the list itself
    is built on first open rather than up front.

**Opening cost.** The sheet asks for its options on every build, and `ILapHistoryStore` now has
`LoadContexts()` for exactly that: `LocalLapHistoryStore` reads each file with a
`Utf8JsonReader`, deserialises the `context` object and **skips the laps as raw tokens**. A lap
carries a 201-point reference curve, so materialising the corpus to list distinct track names was
the reason the dialog stalled — measured on a 120-session / 3,000-lap corpus, **9 ms instead of
128 ms**. `CachingLapHistoryStore` caches contexts separately from the full read, and both caches
drop on any write.

Tests: `SessionPlannerPageTests` (detection rules, derived name), `NewPlanDialogViewTests`
and `SessionPlannerViewTests` (real typing through a headless window, field ordering, the
gaps-only sheet, the mode chip), plus the Agent UI review journey which now captures both
entry points.

## Lap-history corpus (#179) — implemented

The corpus every fuel and lap-time estimate rests on. Deliberately **separate from plan
history**: plans stay a short list the user made on purpose, while this grows to hundreds
of sessions. Two writers (the recorder, and later the results importer), one reader.

- **Model** (`LapHistoryModels.cs`) — `LapHistorySession` → `LapHistoryRecord`, with
  `LapHistoryContext`, `LapHistoryConditions` and `LapHistoryTire`.
  - **Context key is `game` + `trackCourse` + `carModel`.** Track length is stored beside
    it as a cross-check; **car class is metadata and not part of the key**, so a future
    "same class" fallback stays possible. Both writers must map onto exactly these three
    fields or one real context splits into two buckets that never join.
  - `HistorySessionKind` (`Practice`, `Qualifying`, `Race`, `Warmup`, `TestDay`,
    `Unknown`) is an **on-disk format**, deliberately not the telemetry contract's
    `SessionType`: typing stored history with a live contract would let a future rename
    change how years of history deserialise.
  - Every qualifier is nullable. Imports can never supply conditions or fuel, so
    filtering on them now would discard imported laps — record generously, filter later.
- **Store boundary** (`ILapHistoryStore`) — local impl `LocalLapHistoryStore`, one JSON
  file per session under `%AppData%/Sprint/lap-history/`, so a corrupt file costs one
  session rather than the whole corpus.
- **Recorder** (`LapHistoryRecorder`) — **always on**. It records completed laps for every
  session type, practice included, **whether or not a plan is armed**, and never consults
  `SessionPlannerService`. Wired into `MainWindow.IngestTelemetryFrame`.
  - Per lap: validity, lap time, sector durations, fuel used/remaining, virtual energy
    used/remaining, per-corner wear/compound/temperature, and nullable program tags
    (written once practice programs exist).
  - Usage is measured between two crossings, so the first recorded lap has no usage and a
    refuelling stop yields `null` rather than a negative number.
  - Persistence is handed to a dispatcher (thread pool by default), so a slow or locked
    disk cannot stall the telemetry read that delivered the frame; a store failure is
    logged and dropped rather than propagated.

### Per-lap reference curve (#181)

Each lap the recorder writes carries a `LapReferenceCurve`: elapsed lap time resampled onto
a fixed interval of 0.5 % of the track (201 points), so a lap chosen as a target can drive a
position-accurate delta instead of a single number.

- **Only the times are stored.** The position of index `i` is `i * PositionStep`, so the
  corpus's largest field is not doubled to record numbers already known by construction.
  Times are rounded to milliseconds — the resolution the sims report and the only resolution
  a delta is shown at. Measured cost: **~3.2 KB of curve per lap** (~3.8 KB for the whole lap
  record), with a test asserting a 4 KB/lap ceiling so a format change cannot quietly balloon it.
- **`LapHistoryRecord.HasReferenceCurve` is the tier check.** Imported laps have no curve and
  never will, so a reader can tell a delta-capable lap from a scalar-only one; a curve read
  back empty or truncated reports the scalar tier rather than a false capability.
- **A partial lap yields no curve at all**, never a misleading one. `FromSamples` returns null
  unless the samples clear the live delta path's guards verbatim (≥ 8 samples, first ≤ 0.2,
  last ≥ 0.8) **plus** a stored-curve-only guard: no interior gap over 5 % of the lap. The
  delta path can tolerate a hole because its trace is only compared live and self-heals next
  lap; this one is written down and re-read as "how the lap was driven", so interpolating a
  straight line through corners nobody saw would be a lie on a driver's screen.
- Invalid laps still get curves — validity is a target-*selection* rule (#184/#186), and an
  invalid lap's shape is still a truthful record of how it was driven.
- **The type says nothing about its producer**, so detailed trace capture (#101) can supersede
  the recorder as the source without touching a single consumer.
- The trace is accumulated in memory (one list append per frame), resampled once at the
  crossing, and attached before the existing off-thread write — so nothing new touches the
  telemetry path.

Contract additions this rests on (#177 and #179): `SessionInfo.CarClass`,
`TrackLengthMeters`, `TotalSessionTime`, `SessionTimeRemaining`,
`LapState.LastLapSectorsSeconds`, and `TelemetryFrame.Conditions`. All mirrored in
`packages/types`. Fuel and tyre multipliers stay null from Le Mans Ultimate: they live in
`PhysicsOptionsV01`, which the shared-memory layout does not publish.

Tests: `app/Sprint.Desktop.Tests/LapHistoryTests.cs`, plus
`HeadlessShellTests.TheRunningAppRecordsCompletedLapsWithNoPlanArmed` for the end-to-end
always-on path.

## What builds on this next

- **#103 global settings** — planner defaults (reserve `+1 lap`, fuel-history source,
  auto-detect mode, capture rate, retention). Feeds `CreatePlanRequest` defaults.
- **#50 fuel calculator** — consumes the **lap-history corpus** (not `LapSummary`) plus
  plan race length/reserve to estimate required liters per stint.
- **#182/#185 results import** — the corpus's second writer, mapping `TrackCourse` and
  `CarType` onto the same context key.
- **#186 plan targets** — the (scope, statistic) selector over `LapHistoryStatistics`.
- **#187 chart stack** — consumes the per-lap reference curve on a track-position domain.
- **#100 planner page + lifecycle UI** — a new primary sidebar page over
  `SessionPlannerService`; Start-now vs Arm-auto-start; Q/R segmented control.
- **#102 online detection** — draft-suggestion vs auto-create-and-arm; populate
  `PlanSegment.Source`/`SourceConfidence` from normalized session data.
- **#101 trace capture** — async, non-blocking writer producing `CaptureManifest`
  chunks for active Q/R segments.

## Boundaries to keep

- Planner logic stays game-agnostic: consume `TelemetryFrame` / Sprint records only.
- The UI depends on `SessionPlannerService`, never on `ISessionPlanStore` or files.
- Remote/API sync writes through a new `ISessionPlanStore` implementation, not by
  changing the service or UI.
