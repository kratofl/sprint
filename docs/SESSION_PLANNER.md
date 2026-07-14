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

## What builds on this next

- **#103 global settings** — planner defaults (reserve `+1 lap`, fuel-history source,
  auto-detect mode, capture rate, retention). Feeds `CreatePlanRequest` defaults.
- **#50 fuel calculator** — consumes `LapSummary` history + plan race length/reserve
  to estimate required liters per stint. Fill in `LapSummary.FuelUsedLiters`.
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
