# Spec — Live Compare: lap traces, HUD overlay, sharing

Status: **agreed design, not implemented.** Produced by a design interview on 2026-08-02.
Related: #21 (sharing & comparing telemetry), #12 (telemetry graphs), #5 (data analysis),
#101 (trace capture — **redefined here**), #187 (chart stack, built and unhosted), #20 (realtime connector).
Builds on `docs/specs/session-planner-history-targets.md` and `docs/SESSION_PLANNER.md`.

The feature: train against a curve. A semi-transparent HUD sits above the game showing a target lap's
curve and your live curve over the stretch of track you are approaching, so you can shape a braking
zone against a reference in real time. The reference is one of your own laps, or a friend's.

This document records **decisions with their rationale** plus the **verified facts** they rest on,
so neither has to be re-derived. Nothing here is built.

---

## 1. Verified facts (do not re-derive)

### Contract and corpus

| Fact | Location |
| --- | --- |
| `TrackLengthMeters` (`double?`) is on `SessionInfo` and mirrored to TypeScript | `Sprint.Desktop.Api/Telemetry/TelemetryFrame.cs:61`, `packages/types/src/telemetry.ts:10` |
| An always-on recorder files every valid lap, in **every** session type including practice, plan or no plan, keyed `game` + `trackCourse` + `carModel` | `Features/SessionPlanning/LapHistoryRecorder.cs`, `LocalLapHistoryStore.cs` |
| `LapReferenceCurve` is **position→time only** — `List<double> TimesSeconds`, no other channel | `Features/SessionPlanning/LapHistoryModels.cs:175` |
| Its `PositionStepDefault` is `0.005` — 201 points per lap, **~68 m per sample at Le Mans** | `LapHistoryModels.cs:178` |
| `PositionStep` is serialised **per instance**, not assumed globally — a curve may carry its own step | `LapHistoryModels.cs:202` |
| `FromSamples` is documented as the seam a future trace source writes through, and the type deliberately says nothing about its producer | `LapHistoryModels.cs:220`, class doc `:170` |
| Curve completeness guards: first sample ≤ 0.2, last ≥ 0.8, ≥ 8 samples, no gap > 10 output intervals | `LapHistoryModels.cs:187-196` |
| Target tiers are already surfaced honestly, but **two-valued**: `"reference curve"` / `"time only"` | `Features/SessionPlanning/PlanTargetResolver.cs:49` |
| Plan target delivery rejects curve-less laps outright | `Features/SessionPlanning/PlanTargetDelivery.cs:140` |
| Telemetry polls at 200 Hz (`PollInterval` 5 ms); the UI drains a published snapshot at ~30 Hz | `Features/Live/TelemetryEngine.cs:28` |

### Chart stack (#187)

| Fact | Location |
| --- | --- |
| Built and **deliberately unhosted**; hosting, metrics, zoom/pan and two-lap overlay were all left open | `Features/Charts/`, `docs/SESSION_PLANNER.md:161` |
| `ChartStackPainter` is SkiaSharp with **no Avalonia**, explicitly so the same render can serve another surface, and exposes BGRA8888 premultiplied pixels | `Features/Charts/ChartStackPainter.cs:12`, `:120` |
| `ChartStackController` is Avalonia-free: cursor in, per-series readout out — unit-testable | `Features/Charts/ChartStackController.cs:20` |
| `ChartSeriesRole` is `Current` (ember) / `Comparison` (blue) — colour means *whose series it is* | `Features/Charts/ChartModels.cs:29` |
| A lap-fraction domain already exists, documented as matching `LapReferenceCurve` positions | `Features/Charts/ChartDomain.cs:32` |
| `ChartSeries.FillArea` is opt-in, for where magnitude is the reading | `Features/Charts/ChartModels.cs:50` |

### Shell, input, overlay

| Fact | Location |
| --- | --- |
| Command ids are `dash.page.next` style; `CommandMeta` carries a UI `Category`, `Capturable`, `DeviceOnly` | `Features/Input/CommandBus.cs:101-110` |
| A transparent, borderless, `Topmost`, `ShowInTaskbar = false` window already exists as precedent | `CaptureRegionWindow.cs:30-38` |
| Win32 interop is idiomatic here — 12 `user32.dll` imports including `CreateWindowExW` and a message pump | `Features/Input/WindowsRawInputSource.cs:517-567` |
| The shell has seven primary views: Home, SessionPlanner, Dashes, Devices, Setups, RaceEngineer, Settings | `Shell/AppView.cs:3` |
| Nothing in the repo has ever rendered *over* the game — only captured a desktop region | — |

### API

| Fact | Location |
| --- | --- |
| JWT auth, password hashing and a user service exist **server-side** | `api/Sprint.Api/Auth/`, `Services/UserService.cs` |
| Entities: `User`, `InviteCode`, `Session`, `Setup`, `Layout` — **no friend relationship, no lap artifact** | `api/Sprint.Api/Data/Entities.cs`, `SprintDbContext.cs:7-11` |
| `InviteCodeDto` is a time-limited **engineer-session** code, optionally linked to a session | `app/Sprint.Contracts/Invite.cs` |
| An engineer can only connect to a running session — invites are bound to live sessions by design | product constraint, stated 2026-08-02 |
| `UserProfile` carries `Id`, `Email`, `CreatedAt` — **no display name** | `app/Sprint.Contracts/Auth.cs:28` |
| InfluxDB stores live `telemetry` points keyed by session — a streaming time-series | `api/Sprint.Api/Telemetry/InfluxTelemetryStore.cs:11` |
| The desktop has **no cloud client at all**; the only `HttpClient` use is GitHub release checks | `Features/Updates/GitHubReleaseSource.cs` |

---

## 2. Decisions

### 2.1 Data — a second trace tier, not a wider curve

- **`LapReferenceCurve` is left exactly as it is.** Every plan target, thumbnail and delta already
  depends on it, it is an on-disk format, and it is the cheap tier that must stay cheap — the
  recorder writes one for every lap ever driven.
- **A separate `LapChannelTrace`** carries the detail Live Compare needs: a fixed position grid and
  **named channels**. Named, versioned channels rather than fixed fields, so a later feature adds
  one without a format migration.
- **Its `PositionStep` is derived per track from `TrackLengthMeters`** to land near **2 m**, and is
  stored on the trace — the same per-instance convention `LapReferenceCurve` already uses. A fixed
  *fraction* would mean 68 m of resolution at Le Mans and 25 m at Zandvoort; the reading a driver
  needs is in metres, so metres is what the step targets. Anywhere in 2–5 m is defensible: a braking
  zone is 100–150 m, so even 5 m gives 20–30 points. 2 m is the default because the cost is trivial
  and the ceiling is set once.
- **Channels: speed, throttle, brake, steering, gear, elapsed lap time.** Elapsed time is included
  so a trace can regenerate a delta without a second source. ~24 bytes per sample, ~160 KB for a Le
  Mans lap and ~60 KB for a typical GP circuit.
- **A trace is written for every valid lap,** on the same completeness guards the curve uses.
  Skipping is unrecoverable and writing is cheap — the principle the corpus spec already applied to
  per-lap numerics. Retention is a **configurable disk budget**, pruning oldest-first while
  protecting the best N per (game, track, car), so a reference lap is never what gets deleted.
- **A pruned lap degrades to the `reference curve` tier,** which the corpus and UI already model.

### 2.2 #101 is redefined

Trace capture as filed specifies **60 Hz time-gridded** capture, and its seam `CaptureManifest`
persists a `CaptureRateHz` (`Features/SessionPlanning/SessionPlanModels.cs:251`). That is a second,
incompatible grid: the corpus is position-gridded, two laps sampled by time never share an x-grid,
and 60 Hz is sparse in slow corners and wasteful on straights — the opposite of what a corner
comparison needs. **#101 becomes the position-gridded `LapChannelTrace`**, and `CaptureRateHz` is
stale under this design. Its acceptance criterion restricting capture to armed Qualifying/Race
segments was already superseded by the always-on recorder.

### 2.3 The HUD

- **A set of small, transparent, topmost, borderless Avalonia windows** — one per reading —
  following `CaptureRegionWindow`. No injection: an injected overlay is a large dependency, an
  anti-cheat risk against an online sim, and a per-game maintenance burden, for placement that is
  nicer but not necessary.
  - *Revised 2026-08-07 from a single window holding a chart stack, on driver feedback.* The
    point of an overlay is that each reading sits where the driver's eyes already are, and a
    stack cannot express that: every panel in it shares one position, one size and one aspect
    ratio. Cost: a host that owns the shared frame, and a layout key per window. Implemented in
    `Features/LiveCompare/` — `HudWindowPlan` (which windows), `HudOverlayWindow` (what they all
    are), `CompareHudWindow` (one chart), `CompareDeltaWindow`, `CompareHudHost` (one timer, one
    fullscreen check, one resample of the rolling window per frame, sliced out to each window).
- **The game must run borderless or windowed.** Exclusive fullscreen will hide the window. The app
  **detects that case and states it** — a HUD that silently shows nothing is the worst outcome.
- **Interactive by default; a lock makes it click-through.** Locked sets
  `WS_EX_TRANSPARENT | WS_EX_NOACTIVATE` so clicks and focus pass to the game and the HUD cannot be
  nudged out of place or steal focus mid-corner. Unlocked, it is draggable and resizable against the
  real thing. Layout persists per (monitor, resolution).
- **A rolling distance window around the car** — proposed 200 m behind, 600 m ahead, both settings.
  A braking zone slides into view as you approach it, which is the described experience, and it needs
  no corner detection: **no dependency on #13 or #19**, both unstarted. Corner anchoring can layer on
  later from the trace's own speed channel, still without a trackmap.
- **Three default windows: throttle, brake, speed** — each showing your lap against the target's,
  ember for yours and blue for the target. Split rather than a combined throttle+brake panel,
  because the whole point of separate windows is placing each pedal trace independently; neither
  is filled, since in a single-channel panel the two series are the same channel on two laps and a
  fill would wash them over each other. The combined `Pedals` panel (`FillArea` to tell the two
  apart without spending colour) stays for the Analysis view, where they share one frame and one
  axis. The window set is user-configurable from the panel catalogue.
- **Plus a fourth, smaller delta window,** carrying the target's name and the delta. Its own
  window rather than a strip in each chart: §2.4 requires the HUD to always name the lap it is
  chasing, and repeating that three times would bury it while dropping it would lose it.
- **The HUD hosts `ChartStackPainter` directly.** It is Avalonia-free by design and hands back BGRA
  pixels, so each overlay window is a thin frame around the same renderer the Analysis view uses.
  A window renders a one-chart stack: with the charts in separate windows there is no shared
  crosshair left for a multi-chart stack to honour.

### 2.4 Target selection

- **Live Compare owns its target, never linked to the armed plan target.** The HUD's main use is
  practice with no plan armed, and a plan target routinely resolves to the `time only` tier, which
  `PlanTargetDelivery.cs:140` already rejects and which cannot feed a curve at all.
- **Consequence, accepted:** during a race with a plan armed, the wheel delta and the HUD can measure
  against different laps. **The HUD therefore always names the lap it is chasing**, so the
  disagreement is never silent.
- The picker reuses the vocabulary of `PlanTargetResolver` — scope, statistic, timestamp, sample size,
  tier — so there is one mental model for "which lap", even though the selection is independent.

### 2.5 Bindings

- **One bindable command: `compare.hud.toggle`** (show/hide), category `Live Compare`, `Capturable`,
  not `DeviceOnly` so the keyboard fallback works. Most drivers have few spare wheel buttons.
- **Lock/unlock and target selection live in the Sprint window only.** This also removes the dead end:
  a locked HUD is click-through, so unlock must be reachable from somewhere that is not the HUD.

### 2.6 Analysis view

- **A new top-level `AppView.Analysis`** — the eighth primary view. Pick any two laps from the corpus
  (yours, imported, or shared) and overlay them on the chart stack with its shared crosshair.
- This is where **#187 finally gets hosted**, and it closes #12 and most of #5. Lap comparison is its
  own activity: shared laps and practice grinding belong to no plan, so hosting it inside the Session
  Planner would leave the most common comparisons homeless.
- It is also the home of the shared-lap library and the Live Compare target picker.

### 2.7 Sharing

- **Both file export/import and cloud**, because the server is being deployed to a Linux host behind
  Cloudflare tunnels. Export/import is not a stopgap — it is how sim communities already trade
  artifacts, it works with no account, and the format falls out of the trace design almost free.
- **Per-lap share codes, no friend graph.** Sharing mints an unguessable code; whoever holds it can
  pull that lap; the owner can revoke it. No requests, accepts, blocking or visibility matrix to
  design, and it fits the real case — "here, try my Spa lap". A friend graph can layer on later
  without touching the trace, the HUD or the corpus.
- **A share code is its own entity, not `InviteCodeEntity`.** Engineer invites are bound to a running
  session and expire with it; a lap code must outlive every session and be revocable on its own.
- **Only laps you explicitly share are uploaded.** The corpus stays local. Consent is per-lap and
  visible — the same standard the planner's import prompt set by refusing silent auto-import.
- **Storage: a compressed blob on a Postgres `LapTraceEntity`,** with game, track, car, lap time,
  owner and share code as indexed columns. The trace is an opaque immutable artifact fetched whole,
  never queried by field. InfluxDB is rejected: our x-axis is track position, not time, and Influx
  would have to fake a time axis for something that is neither streamed nor range-queried.
- **A shared lap enters the corpus as a third-party lap** with its provenance recorded, so it can be
  a Live Compare target exactly like one of your own.
- **`UserProfile` needs a display name.** Attributing a shared lap to `luca@…` is wrong; `UserEntity`
  and `UserProfile` carry email only today.

---

## 3. Consequences we are accepting

- **Your own line stops at your current position.** The target extends ahead into the rolling window;
  you cannot draw a future you have not driven. The HUD design has to be built around that asymmetry
  rather than hiding it.
- **The HUD and the wheel delta can chase different laps** (§2.4). Mitigated by always naming the
  target, not by linking them.
- **Exclusive fullscreen hides the HUD** (§2.3). Mitigated by detection and a stated message.
- **`TierNote` becomes three-valued** — `time only` / `reference curve` / `full trace`. It is
  two-valued today at `PlanTargetResolver.cs:49`.
- **Contract changes must mirror to `packages/types`** per AGENTS.md, as `TrackLengthMeters` already did.

---

## 4. Sequencing

Dependency order, one issue per capability under a Live Compare epic:

1. **`LapChannelTrace` + recorder write path + retention budget.** *The irreversible one* — every lap
   driven before this exists has no channels and can never be a Live Compare target. It also
   supersedes #101, which should be updated rather than built as filed.
2. **HUD overlay window** — transparent/topmost window, lock/click-through, persisted per-monitor
   layout, fullscreen detection, `compare.hud.toggle`, rolling-window rendering through
   `ChartStackPainter`.
3. **Analysis view** — hosts the chart stack, two-lap overlay, target picker. Cheap once traces exist,
   since #187 is already built.
4. **Cloud** — desktop auth client, display name on the user, `LapTraceEntity`, upload/fetch, share
   codes and revocation. Waits on the Linux deployment.
5. **File export/import** — a single self-describing lap file with trace plus provenance.

---

## 5. Deliberately open

- **Exact position step.** 2 m proposed; 2–5 m is the defensible band. Settle against a real trace.
- **Disk-budget default** and what the pruning UI says when it drops a lap to a thinner tier.
- **Default rolling-window sizes.** 200 m behind / 600 m ahead proposed, both settings.
- **Whether steering and gear ever become default panels** — configurable from day one either way.
- **Corner anchoring** (§2.3) — layerable later from the speed channel, deliberately not designed.
- **Friend graph** (§2.7) — layerable later, deliberately not designed.
- **Visual design of the HUD.** Follow the `dataviz` guidance and `docs/DESIGN.md` before the first
  line is drawn, as the chart stack did. Semi-transparency over a moving game image is a legibility
  problem the app's surfaces have never had to solve.
