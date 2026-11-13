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
- Some channels come only from a game that reports them: `worldX/Y/Z` (the line driven) and
  `throttleApplied`/`brakeApplied` (the pedals after traction control and ABS — LMU's
  `mFilteredThrottle`/`mFilteredBrake`; `throttle`/`brake` are the driver's). Each is written only when
  every sample of the lap had it, so older traces and other games simply lack it and a reader copes with
  absence. All channels on: 44 bytes per sample, ~300 KB for a lap of Le Mans.
- The step is derived per track from `TrackLengthMeters` to land near **2 m**
  (`LapChannelTrace.TargetSampleMeters`) and stored on the trace. A fixed fraction would mean 68 m at Le
  Mans and 25 m at Zandvoort; a braking zone is read in metres.
- Traces live outside the session JSON, one compressed file per lap under `lap-traces/`, with
  `LapHistoryRecord` holding only a `TraceId`. The session file is rewritten on every lap crossing, so an
  embedded trace of up to ~300 KB would make each crossing O(n²).
- A trace is written for every valid lap that passes the curve's completeness guards. Skipping is
  unrecoverable; writing is cheap.
- A trace also carries the car's own readings (`LapTraceCar`: engine, fuel and energy, each wheel
  corner, damage), about a hundred channels, which makes a lap megabytes instead of ~300 KB. What
  compares or trains against a lap reads it through `LapTraceCar.Without`. Only the lap page draws
  the car, and it is sent a thinned copy (`LapTraceCar.Only`, about a thousand samples a channel on
  a coarser grid of its own) beside the driving: the whole trace as JSON would be megabytes a lap.
- Traces are kept for good and nothing caps their size: Settings shows the total. Deleting by age is
  the driver's choice (`traceExpiryDays`, 0 by default). `LapTraceRetention` then protects the best N
  per (game, track, car), so a reference lap is never what gets deleted. Pruning clears the
  `TraceId`, so the stored tier never lies; a pruned lap degrades to `reference curve`.
- This replaced #101's time-gridded 60 Hz capture: two laps sampled by time never share an x-grid.
  `CaptureManifest.CaptureRateHz` is stale under this design.
- Nothing may block the telemetry read; trace writes go through the recorder's dispatcher.

## Charts

- One stack, one shared x-domain, one crosshair. Lap comparison uses track position (two laps drift
  apart in time, so a time axis puts the same corner at different x); stint trends use lap number.
- The lap page zooms and pans the stack as one window over the lap (`AnalysisPlot.ts`), and the map
  marks that stretch. The value axis stays the whole lap's while zoomed, so panning never rescales a
  line under the eye.
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
- The HUD is never drawn in the Sprint window; it is arranged on the monitor itself (driver decision
  2026-11-03). Arrange HUD puts the windows up unlocked, with or without training and without a target
  (`compare.hud.arrange`): a window drags by its body, sizes by a corner grip the page draws (a transparent
  Electron window does not resize reliably by its edges) and leaves by its ×, and a palette along the top
  adds readings and ends it. Otherwise every click passes through to the game; there is no lock to forget.
- The windows never take focus, so the game keeps the keyboard. Layout persists per (monitor, resolution)
  and per window id, in device-independent pixels.
- Each chart looks ahead: the stretch past the car is lit, Brake marks the target's next brake point and
  Speed its slowest point, both read off the target's line in the window (`hud/hudModel.ts` `hudMark`).
  The delta says whether you gained or lost over the last 200 m.
- Electron polls `/api/compare/frame` (~20 Hz) only while the HUD is open and sends each window its own
  panel, and only when it changed — a car standing still costs no repaint.
- A rolling distance window around the car, 200 m behind / 600 m ahead by default; the driver picks
  both on the On track page (`compare.range`, limits in `LiveCompareSettings.IsRange`) and the HUD
  draws the new range from its next frame. It needs no corner detection. Your own line stops at the
  car; the target extends ahead.
- `LiveCompareController` keeps its own sample buffer rather than reading the recorder's: "comparing"
  and "being recorded" are different states.

## Target

- Live Compare owns its target and is never linked to the armed plan's. Its main use is practice with no
  plan, and plan targets often resolve to `time only`, which cannot feed a curve.
- Consequence: the HUD and the wheel delta can chase different laps, so the HUD always names its lap.
- Picked with Chase this lap on a lap's own On track page (the list shows the course being driven, else
  the newest one with a trace, fastest laps first), or from any lap with channels in Analysis. Only
  full-trace laps open there and only they can be targets. Every lap a friend shared on the course is
  listed whatever its rank: it is picked to chase their line.
- One bindable command, `compare.hud.toggle` (capturable, not device-only so the keyboard works).
  Starting arranging and target selection live in the Sprint window, because the HUD is click-through
  while driving. The HUD closes with the main window for the same reason.

## Analysis view

A top-level view over every lap Sprint recorded, imported or was sent. Lap comparison is its own
activity — shared laps and practice belong to no plan, so it does not live inside the planner. It is
also the home of the shared-lap library.

Three pages: the sessions list grouped by car and track, one session (its lap times by run, its laps),
and one lap. The host sends every session on each state poll (`analysis.sessions`), so the list never
needs a refresh; search and filters narrow it in the page. The list shows your sessions or the laps
others shared with you (Mine | Shared), never one list of both: a friend's lap mixed into yours reads
as your own pace.

A lap opens alone. Comparing is the driver's choice ("Compare with…"), never automatic, and offers only
laps on the open session's course — any session with that car on that track (`analysis.courseLaps`),
yours first, then shared ones. Laps from two cars or two tracks are never compared: the lines do not
share a track position, which is also why cars are matched by their name ("LMP2 ELMS"), not their
livery (see [session-planner.md](session-planner.md)). The lap page draws the line on a track map
from `worldX/Z` when the trace has it, and the driver arranges its charts; the arrangement is a
per-viewer preference in the renderer's local storage, not host state. Traces carry no corner names,
so corners are found where smoothed speed dips by 25 km/h and are numbered from the start line
(`AnalysisLapCharts.ts`).

The car's readings are off the page until asked for: a card shows the whole car at the charts'
cursor, and a chart of one joins the others from "Add chart" or by a click on its value on the car.
A chart of the four wheels gives each corner one colour in every such chart (`--channel-fl` …);
compared, it becomes a chart per wheel, because eight lines in one plot cannot be told apart. A
chart a lap did not record stays on the page, empty: the arrangement is the same for every lap.

Pins over the lap's charts mark where a car setting changed and where a note was left. The settings
(TC, ABS, brake bias, motor map, migration, anti-roll bars) are step channels in the trace, written
only for what the car has, and the changes are derived from them in the renderer
(`AnalysisLapMarks.ts`), so they travel with a shared lap without a field of their own; older traces
simply have none. Notes live in two places on purpose: the driver's own in `lap-notes.json`
(`LapNotes`), because the recorder rewrites the session it is filling from its own copy and would drop
a note written mid-session, and those that came with a shared lap on its record, read-only. The lap
file's header carries both, so a note goes with the lap; a file from before notes reads with none.

On track keeps its own two-lap compare page (`ComparePage` in `OnTrackPages.tsx`), with its own
corner finder (`OnTrackLaps.ts`).

The host still serves the older `analysis.filter`, `analysis.selectLap` and `analysis.refresh` commands
and the primary/comparison laps in state; no page sends or reads them any more.

## Sharing

- Both a lap file and cloud. The file works with no account and is how sim communities already trade
  artifacts.
- Opening a lap file never imports it. The host reads it without filing it
  (`/api/laps/import/preview`: the lap, or which way the file is unreadable, and whether it is already
  here), the page shows that, and only Add files it. Electron keeps the file's bytes until then, so what
  is added is exactly what was shown.
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

Exact step (2–5 m is the defensible band), disk-budget default, whether steering
and gear become default panels, corner anchoring from the speed channel, a friend graph, and the HUD's
visual design — semi-transparency over a moving game image is a legibility problem the app has not
solved yet.
