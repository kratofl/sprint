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

The startup scan, the path+size+last-write ledger, the decline list and the import prompt are
**#185** — nothing calls the import service from production code yet.

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
- **Name is optional and says so** (#178): the field follows the Context section, is
  labelled `Name (optional)`, and its placeholder previews `NewPlanDraft.DerivedName` — the
  same string the plan really gets. The placeholder is retargeted in place from the
  track/car change handlers, so typing is never interrupted and the caret is never lost.

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
- **#189 dash delivery** — pushes a chosen lap's curve into `DeltaTracker` and scalar targets
  into `target.*` bindings.
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
