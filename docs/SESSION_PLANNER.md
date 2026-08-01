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

Contract additions this rests on (#177 and this issue): `SessionInfo.CarClass`,
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
- **#181 reference curve** — a position→time curve per recorded lap, written by the same
  recorder; imported laps have none and degrade to a scalar target.
- **#182/#185 results import** — the corpus's second writer, mapping `TrackCourse` and
  `CarType` onto the same context key.
- **#184 corpus statistics** — median of real driven laps with sample size.
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
