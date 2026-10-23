# Live Compare: lap traces, HUD, analysis, sharing

Train against a curve: a semi-transparent HUD above the game shows a target lap's traces and the
live lap over the stretch of track ahead. The reference is one of your own laps or a shared one.
Epic #193 (#194–#198).

Code: `app/Sprint.Desktop.Core/Features/SessionPlanning/` (`LapChannelTrace`, `LapTraceCodec`,
`LocalLapTraceStore`, `LapTraceRetention`), `Features/Charts/`, `Features/LiveCompare/`,
`Features/Analysis/`, `Features/Sharing/`; API `LapTraceEntity` in `api/Sprint.Api/Data/Entities.cs`.

**State:** traces, retention, the Analysis view, lap files, the cloud client and the HUD exist. The
HUD is the On track page plus Electron windows (`app/desktop/electron/hud.ts`) over
`LiveCompareService`; it has not yet been driven against a real game. Cloud sharing has never been run
against a real server.

## Traces: a second tier, not a wider curve

- `LapReferenceCurve` stays exactly as it is (see [session-planner.md](session-planner.md)). It is the
  cheap tier written for every lap ever driven.
- `LapChannelTrace` carries named channels — speed, throttle, brake, steering, gear, elapsed time — on a
  position grid. Named channels let a later feature add one without a format migration. Elapsed time is
  included so a trace can regenerate a delta on its own.
- The step is derived per track from `TrackLengthMeters` to land near **2 m**
  (`LapChannelTrace.TargetSampleMeters`) and stored on the trace. A fixed fraction would mean 68 m at Le
  Mans and 25 m at Zandvoort; a braking zone is read in metres.
- Traces live outside the session JSON, one compressed file per lap under `lap-traces/`, with
  `LapHistoryRecord` holding only a `TraceId`. The session file is rewritten on every lap crossing, so an
  embedded ~160 KB trace would make each crossing O(n²).
- A trace is written for every valid lap that passes the curve's completeness guards. Skipping is
  unrecoverable; writing is cheap.
- `LapTraceRetention` prunes oldest-first against a disk budget while protecting the best N per
  (game, track, car), so a reference lap is never what gets deleted. Pruning clears the `TraceId`, so
  the stored tier never lies; a pruned lap degrades to `reference curve`.
- This replaced #101's time-gridded 60 Hz capture: two laps sampled by time never share an x-grid.
  `CaptureManifest.CaptureRateHz` is stale under this design.
- Nothing may block the telemetry read; trace writes go through the recorder's dispatcher.

## Charts

- One stack, one shared x-domain, one crosshair. Lap comparison uses track position (two laps drift
  apart in time, so a time axis puts the same corner at different x); stint trends use lap number.
- A series reports `null` where it has nothing, including out of range — never a held edge value.
  Continuous telemetry interpolates linearly; per-lap figures are stepped.
- Empty and insufficient-data panels say so; an axis drawn around nothing reads as zero.
- Color means whose series it is: current lap = brand, comparison = blue.

## HUD

- Separate small transparent, topmost, borderless windows — one per reading (throttle, brake, speed by
  default, plus a smaller delta window naming the target). Driver feedback 2026-08-07: an overlay is
  useful because each reading sits where the eyes already are, which one stacked window cannot do.
  Single-channel windows are not filled; the combined pedals panel with fills stays in Analysis.
- No injection into the game: injection is a large dependency, an anti-cheat risk on an online sim, and
  per-game maintenance.
- The game must run borderless or windowed. Exclusive fullscreen hides the HUD; the app detects that and
  says so (`HudInterop.IsExclusiveFullscreenActive`). A HUD that silently shows nothing is the worst outcome.
- The windows never take focus, so the game keeps the keyboard. Unlocked, a window drags by its body and
  sizes by a corner grip the page draws (a transparent Electron window does not resize reliably by its
  edges); locked, every click passes through to the game. Layout persists per (monitor, resolution) and
  per window id, in device-independent pixels.
- Electron polls `/api/compare/frame` (~20 Hz) only while the HUD is open and sends each window its own
  panel, and only when it changed — a car standing still costs no repaint.
- A rolling distance window around the car (proposed 200 m behind / 600 m ahead). It needs no corner
  detection. Your own line stops at the car; the target extends ahead.
- `LiveCompareController` keeps its own sample buffer rather than reading the recorder's: "comparing"
  and "being recorded" are different states.

## Target

- Live Compare owns its target and is never linked to the armed plan's. Its main use is practice with no
  plan, and plan targets often resolve to `time only`, which cannot feed a curve.
- Consequence: the HUD and the wheel delta can chase different laps, so the HUD always names its lap.
- Picked on the On track page from the course being driven (else the newest one with a trace), fastest
  laps first, or from any lap with channels in Analysis. Only full-trace laps can be targets.
- One bindable command, `compare.hud.toggle` (capturable, not device-only so the keyboard works).
  Lock and target selection live in the Sprint window only, because a locked HUD is click-through.
  The HUD closes with the main window for the same reason.

## Analysis view

A top-level view: pick any two laps (own, imported or shared) and overlay them. Lap comparison is its
own activity — shared laps and practice belong to no plan, so it does not live inside the planner. It is
also the home of the shared-lap library.

## Sharing

- Both a lap file and cloud. The file works with no account and is how sim communities already trade
  artifacts.
- Per-lap share codes, no friend graph: an unguessable code pulls one lap and the owner can revoke it.
  A friend graph can layer on later without touching traces or the HUD.
- A share code is its own entity, not an engineer invite link: an invite links two accounts once, a lap
  code pulls one lap and must outlive every session.
- Only explicitly shared laps leave the machine; the corpus stays local.
- Storage is a compressed blob on Postgres `LapTraceEntity` with game, track, car, lap time, owner and
  code as indexed columns. Not InfluxDB: the x-axis is track position and the trace is fetched whole.
- A shared lap enters the corpus as a third-party lap with its provenance, so it can be a target.
- Shared laps are attributed by the user's display name, never their email address.

## Deliberately open

Exact step (2–5 m is the defensible band), disk-budget default, rolling-window sizes, whether steering
and gear become default panels, corner anchoring from the speed channel, a friend graph, and the HUD's
visual design — semi-transparency over a moving game image is a legibility problem the app has not
solved yet.
