# Spec — Session Planner: history corpus, plan modes, dash targets

Status: **agreed design, not implemented.** Produced by a design interview on 2026-08-01.
Parent epic: #8. Related: #99 (done), #100, #101, #102, #103, #50, #10, #9, #157, #159.

This document records **decisions with their rationale** plus the **verified facts** they rest on,
so neither has to be re-derived. Nothing here is built yet except where explicitly noted.

---

## 1. Verified facts (do not re-derive)

### Existing code seams

| Fact | Location |
| --- | --- |
| Plan name is already optional (`Track – Car`, then `New Session Plan`) | `NewPlanDialog.NewPlanDraft.ResolveName`, `SessionPlannerService.CreatePlan` |
| Delta already computes a position→time reference curve from the fastest completed **valid** lap, injects `Lap.Delta` + `Lap.TargetLapTime`; guards: first sample ≤ 0.2, last ≥ 0.8, ≥ 8 samples; **in-memory only**, resets on track/session/in-car change | `Features/Live/DeltaTracker.cs` |
| Dash bindings read from `DashBindingContext(TelemetryFrame, AppSettings)`; `lap.delta`, `lap.target` already exist | `Features/Dashes/DashBindingResolver.cs` |
| `fuel_target` widget is bound to `car.fuelPerLapLiters` — i.e. *actual* consumption; no real target value exists anywhere | `Features/Dashes/DashWidgetCatalog.cs` |
| Semantic condition vocabulary exists (`Neutral`, `GoodOnTarget`, `ColdLow`, `AssistActive`, `Warning`, `Critical`, `Fault`, `RaceControl`) but is used only for banner inversion | `Features/Dashes/DashAttention.cs`, `DashPainter` |
| Per-widget style overrides store **Graphite token names, never raw hex**; `FromTheme` forces `Critical`/`Fault`/`Danger`/`RpmNearLimit` back to functional red | `DashModels.DashWidgetStyle`, `DashPalette.FromTheme`, `DashPalette.StyleColor` |
| Alerts are transient banners with **one** value, types `tc_change`/`abs_change`/`enginemap_change`, duration clamped **0.5–5 s** | `Features/Dashes/DashAlertTracker.cs` |
| Game extension point covers **telemetry only**: `GameDescriptor(Id, Name, Transport, Available)` + a hardcoded `if`-chain factory | `Sprint.Games/GameDescriptor.cs`, `GameTelemetryPackage.cs` |
| `SessionPlan.SetupReferences` and `LapSummary.SetupReference` already exist | `Features/SessionPlanning/SessionPlanModels.cs` |
| `SetupProgram` is `{ Id, Name, IsTemplate, Values: Dictionary<string,double> }` — **no car, track, provenance or parent link** | `Features/Setup/SetupModels.cs` |
| No chart/graph/axis component exists anywhere (client or web). Closest is the `input_trace` dash widget | — |
| SkiaSharp is already a dependency (`DashPainter`) | — |
| `packages/types/src/telemetry.ts` mirrors `sessionType`/`sessionTime`/`maxLaps` — contract changes must update it (AGENTS.md) | — |

### Telemetry contract — what is and isn't available

Available: `SessionInfo.{Game, Track, Car, SessionType, SessionTime, BestLapTime, MaxLaps, InCar}`,
`CarState.{FuelLiters, FuelPerLapLiters, BrakeBiasRear, …}`, `TireState.{WearPercent, Compound, 5 temps, PressureKPa}` per corner,
`EnergyState.{VirtualEnergy, VirtualEnergyPerLap, StateOfCharge, …}`, `RaceState.{Position, TotalPositions, GapAhead, GapBehind}`.

Gaps, both fixable in the LMU adapter:

1. **Total session time is missing.** `SessionInfo.SessionTime` is *elapsed* (`ScoringInfo.mCurrentET`).
   `mEndET` (double, "ending time") sits at **offset 76**, verified against the shipped header
   `…/Le Mans Ultimate/Support/SharedMemoryInterface/InternalsPlugin.hpp` — between `mCurrentET`@68
   and `mMaxLaps`@84, matching the parser's existing offsets. `mSessionTimeRemaining` (float) also exists.
2. **The lobby car is dropped.** `LmuTelemetryMapper.SessionOnlyFrame` (the pre-cockpit path) never sets
   `Car`, even though `VehicleScoringInfoV01` exposes `mVehicleName[64]`, `mVehicleClass[32]`, `mIsPlayer`,
   `mBestLapTime`, `mLastLapTime` from *scoring* — no cockpit required. The car **is** available in the lobby.

Also present in the header and currently unused: `mGameMode` (1=server, 2=client, 3=both), `mServerName[32]`,
`mMaxPlayers`, `mIsPasswordProtected` (multiplayer is *stated* by the sim, not guessed), `mFuelMult` (0x–7x),
`mTireMult`, `mIsFixedSetup`, `mTrackGripLevel`, `mRaining`, `mAvgPathWetness`.

### LMU on-disk data

- **Results:** `UserData/Log/Results/*.xml`. Parser exists (`Sprint.Games/LeMansUltimate/Results/`), is tested,
  and is **not wired into the client**. Carries `TrackVenue` **and** `TrackCourse`, `CarType` + `CarClass`,
  `SessionTimeUtc`, `RaceLaps`, `RaceTimeMinutes`, per-lap `LapTimeSeconds`, sectors, top speed, compounds.
  Session kinds: `Practice`, `Qualifying`, `Warmup`, `Race`, `TestDay`.
  **No fuel data of any kind. No weather, grip or multipliers. No position trace.**
- **Setups:** `UserData/player/Settings/<Track>/<name>.svm`, INI-like plain text, `Key=Value`, `[SECTION]`
  headers, `//` comments, ~173 values. Header carries `VehicleClassSetting="Hypercar Porsche_963 WEC2025"`
  and a commented `//VEH=…Porsche_963_2023\1.43\….VEH`. **Values are indices, not physical units.**
  Shared memory does **not** reveal which setup is loaded — only `mIsFixedSetup`.
- **Weekly schedule:** nothing on disk (no `*weekly*`/`*schedule*`/`*event*` in the top three levels).
  The install ships `HttpServer.WindowsDesktop.dll` + `CefOverlay.dll`, so the in-game UI reads an
  undocumented localhost REST service — available only while the game runs. Research pending.

### Join keys between the two history writers

Live `Session.Car` = `"Peugeot 9X8"` (model) ↔ imported `<CarType>` = `"Porsche 963"` (model).
Live `Session.Track` = `ScoringInfo.mTrackName` ↔ imported `TrackCourse` (layout), **not** `TrackVenue`.
Cross-check available: live `mLapDist` ↔ imported `TrackLengthMeters`.

---

## 2. Decisions

### 2.1 Plan creation

- **Name stays optional, and says so.** Move `Name` below the `Context` section, label it `Name (optional)`,
  and make its placeholder show the **live derived name** as Track/Car are typed. Implemented by holding a
  reference to the name box and updating `PlaceholderText` from the Track/Car `TextChanged` handlers — no
  modal rebuild, no lost caret. *This lands on the existing `feat/issue-100-session-planner-page` branch.*
- **Two modes, persisted:** `PlanMode { Quick, Planned }` on `SessionPlan` and `CreatePlanRequest`,
  defaulting to `Planned` so pre-existing plan files keep their meaning. Persisted rather than derived
  because a Quick plan's inputs carry lower confidence by construction, and #102 requires that confidence
  to remain visible after the modal closes.
- **Two entry points in the page header:** `Quick plan` (ember primary) and `New plan…` (neutral). No mode
  switch inside the modal — that sheet already has two segmented controls, and `docs/DESIGN.md` scopes
  segmented controls to closely related *state*, not mode switching.
- **Quick mode asks only for gaps.** Detected context renders read-only; inputs appear only for what could
  not be detected, and disappear as detection improves. In the best case (in car, lap-based, history present)
  it is a summary plus `Create`.
- **Race duration is auto-detected** via the `mEndET` addition, behind a plausibility gate: zero, negative
  or absurd values fall back to asking rather than committing a garbage number.

### 2.2 History corpus — the part that cannot be back-filled

- **A dedicated store,** not synthesised plans: `LapHistorySession` behind `ILapHistoryStore`, holding a
  `List<LapSummary>`. **Two writers, one reader** — the LMU importer and Sprint's own sessions. Keeps
  `SegmentKind` two-valued (the Q/R tab model, `TryAutoStart` and `SegmentDetail` all depend on it) and keeps
  hundreds of imported sessions out of the plan-history list.
- **An always-on recorder** writes completed laps for **every** session type, Practice included, whether or
  not a plan is armed — so practice grinding for an event accrues value with no user action, and the future
  practice-programs feature starts with a populated corpus.
- **Its own session-kind enum:** `HistorySessionKind { Practice, Qualifying, Race, Warmup, TestDay, Unknown }`.
  This is an **on-disk format**; typing it with the telemetry contract's `SessionType` would let a future
  contract rename silently change how years of history deserialise.
- **Context key:** `game` + `trackCourse` (with lap distance stored beside it as a cross-check) + `carModel`
  (live `VehicleName` ↔ imported `CarType`). `carClass` is stored as metadata, not part of the key, so a
  future "same class" fallback stays possible. The importer maps onto these fields explicitly — if it wrote
  `TrackVenue` while the recorder writes the course, the same real context would split into two buckets that
  never join, and the median would silently use half the data.
- **Conditions recorded, not yet filtered:** wetness, grip, fuel/tyre multiplier, fixed-setup, car class, all
  **nullable**. Imports can never supply them, so filtering now would discard every imported lap; not
  recording at all is unrecoverable.
- **A compact reference curve per lap:** position→time resampled at a fixed interval (~0.5 % of track,
  ~200 points, a few KB), written by the same recorder. Independent of #101, which can later supersede the
  source without changing consumers. Imported laps have no trace and therefore degrade to a **scalar target**;
  the UI must be honest about which tier a chosen lap is.
- **Per-lap numerics (all nullable):** fuel used + remaining, **virtual energy used + remaining**, per-corner
  `WearPercent` + compound, tyre temp aggregates. Virtual energy is not optional in LMU — a hypercar stint is
  energy-limited as much as fuel-limited, so a fuel-only record predicts stint lengths the car cannot run.
- **Program tags:** `programType` + `programId` + `runId`, nullable. Written by practice programs when they
  exist; scopes in the UI list whatever program types the corpus actually contains.

### 2.3 Lap-time statistics

- **Corpus rule stays #103's:** all valid timed laps for the same context, all session types.
- **The statistic is the median, not the mean** — this corpus is full of traffic laps, offs and in/out laps
  that drag a mean upward by seconds. Always shown with sample size (`2:05.4 · median of 47 laps`).
- **Every preset resolves to a real, driven lap.** `Median` means *the lap at the median position* (lower
  median on even counts), never an interpolated time — a synthetic time has no per-corner pace and therefore
  no reference curve, and a pro-rata delta from a bare time is actively misleading on a driver's screen.

### 2.4 Target selection

`PlanTargets` are stored **per `SegmentKind`** (a Qualifying set and a Race set), editable before anything
starts; `PlanSegment` holds actuals and does not exist yet at planning time.

A target is picked as **(scope, statistic)**:

- Scopes: `Current Quali` (the most recent Qualifying session for this context — **with its timestamp in the
  label**, so "should be the one right before the race" is verifiable; no silent recency cutoff),
  `Quali` (all-time for the context), `Practice` (all-time for the context), and `Practice program`
  (per program type, e.g. `QUALI`, `PACE`) which is hidden in Quick mode.
- Statistics: `Fastest`, `Median`, `Slowest`, `Custom` (pick a specific lap from the list, ordered fastest →
  slowest). Each label shows its time in brackets.

### 2.5 Dash

- **Delivery is split by what each target physically needs.** The lap reference is pushed into `DeltaTracker`
  and surfaces through the existing `Lap.Delta` / `Lap.TargetLapTime` — **no contract change**; a
  position-relative delta can only be computed inside the tracker. All other targets (fuel per lap, stint
  laps, …) arrive as a third member on `DashBindingContext`, exposed as `target.*` bindings. Putting the
  latter into `TelemetryFrame` would force the LMU adapter, the demo source, `packages/types` and the API to
  carry fields describing a *plan*, not a car.
- **All target changes latch at the start/finish line**, the same instant `DeltaTracker` already detects
  (lap-number increment). A value that flips mid-lap would be measured against a target the lap was never
  driven with. The lap-summary alert fires at that same moment: the finished lap is summarised against the
  old target, then the new one takes effect. Planner UI shows "applies from the next lap" on an edit during a
  live session.
- **Declarative condition rules** replace ad-hoc colour choices — filed as **#159**. Rule = binding,
  operator, threshold *or* `ThresholdBinding` (so a plan target can drive it), resulting `DashCondition`,
  optional style property, **Graphite token value — never hex**, plus `Priority`. `Critical`/`Fault` red stays
  unoverridable. `DashPalette.TyreColor`'s hardcoded 110/100/70 thresholds are the proof case.
- **New alert type `lap_summary`:** full-screen takeover with a fixed composition — `Lap x/y`
  (`Session.MaxLaps == 0` → lap number only), `Race.Position`, Δ to target, `Lap.LastLapTime`,
  vs session best (`LastLapTime − Lap.BestLapTime`), fuel used. Convention: **`delta = actual − target`,
  negative is better** — true for fuel (used less than planned) and for lap time (faster). Maps to
  `GoodOnTarget` / `Warning` through #159. Dismissal is a **plain timer**: default 5 s, clamp raised to 15 s
  for this type.

### 2.6 Charts

- **One chart stack with a pluggable X-domain** (track position, lap number, session time). **One stack, one
  domain.** Stacked vertically, sharing a single cursor: hovering shows a synchronised vertical crosshair with
  tooltips across every chart at once.
- Lap comparisons belong on **track position**, not time — two laps drift apart in time and the same corner
  would land at different X positions in different charts, destroying the point of a shared crosshair. Stint
  trends belong on lap number. Same mechanics, different domain.
- **Cursor state lives in an Avalonia-free controller** (like `SessionPlannerController`) so "hover at
  position 0.62 → each chart reports its value there" is a unit test.
- Drawn with SkiaSharp (already a dependency). Visual design follows the `dataviz` guidance **before** the
  first chart line is written.

### 2.7 LMU import

- **XML is an import path, never a query path.** Sprint's own history is the single source of truth; if Sprint
  has no data, the user sets the value. The planner therefore never reads game-native data — it reads Sprint
  records, per `docs/SESSION_PLANNER.md`.
- **Idempotency, split by when it is used:** a ledger of path + size + last-write drives the startup scan, so
  a normal launch parses **nothing**; a natural key (`track + session type + session time + player`) is
  checked by the importer at write time, on files it was going to parse anyway. A moved or restored results
  folder costs one re-parse pass and duplicates nothing. No hashing.
- **Prompt:** a startup dialog when the scan finds sessions that are un-imported **and** not previously
  declined, showing a per-kind breakdown (`Practice 9, Qualifying 3, Race 2`) rather than a blind yes.
  Declining marks those files declined so they never prompt again. A permanent manual entry point exists in
  the Session Planner header and in Settings. Silent auto-import is rejected: a first run would write hundreds
  of sessions into the corpus behind every fuel and lap-time figure with no consent and no traceable origin.

### 2.8 Setups

- **Capture:** watch `UserData/player/Settings/**/*.svm`, snapshot on change, dedupe by content.
  Promotion into the vault stays an **explicit user action**.
- **Session association:** best-guess default (most recently modified `.svm` matching car + track, optionally
  plausibility-checked against observable values such as `BrakeBiasRear`), **confirmed by the user**. An
  unidentified setup is marked unknown rather than guessed. The confirmed reference goes into the history
  session and `LapSummary.SetupReference` — fields that already exist for this.
- **Writing: export only.** Sprint produces a valid `.svm` using the original as a template with only changed
  values replaced, to a location the user picks; the game directory is never touched. This delivers "edit
  setups in Sprint" without needing a judgement about a third party's anti-cheat enforcement, and it
  generalises across games whose policies differ. Direct writing may later become an opt-in (game not
  running, backup taken) reusing the same write path with a different destination.
- Note for any editor UI: `.svm` values are **indices**, so faithful storage, diffing and versioning are
  possible, but rendering "rear wing = 7 clicks" needs vehicle data the file does not contain.

### 2.9 Multi-game

- **`IGameProvider` per game** with `Descriptor` plus **optional** capabilities:
  `CreateTelemetrySource()`, `IResultsImporter? Results`, `ISetupRepository? Setups`, `IScheduleSource? Schedule`.
  Capability interfaces live in `Sprint.Desktop.Api` (where `ITelemetrySource` already is); implementations
  live in `Sprint.Games`; every capability returns **Sprint records**, never game-native structures.
- `null` means "this game cannot do this", so discovery is a null check and the UI adapts (no import entry for
  a game without an importer). A new game is one class implementing what it can. iRacing will have a schedule
  capability LMU has to reconstruct from a website; AC will have none — the provider must be allowed to say so
  without the shared layer knowing.

### 2.10 Sync

- Targets are **modelled sync-ready but no sync is built**: plain serialisable data on the plan, consumed
  derivatively by the dash. A future `RemoteSessionPlanStore` plus subscription can change them without
  touching the planner or the dash path. Last write wins — targets are intent, not measurements, so nothing
  irrecoverable is lost in a conflict.

---

## 3. Sequencing

Individual issues per capability, all linked to epic #8, in dependency order:

1. **Telemetry additions** (small): `mEndET` → contract + `packages/types` mirror; lobby `Car` in
   `SessionOnlyFrame`.
2. **History store + recorder** — context key, nullable qualifiers, reference curve, per-lap numerics,
   program tags. *The only decision here that cannot be corrected later: every lap recorded without these is
   lost to every later feature.*
3. **Game provider layer** (`IGameProvider` + capability interfaces).
4. **LMU results importer** + startup scan/dialog + ledgers.
5. **Quick/Planned modes** in the planner.
6. **Plan targets** + the (scope, statistic) selector.
7. **`lap_summary` alert.**
8. **Chart stack** with shared cursor.
9. **Setup capture / vault / variants / export.**
10. **Practice programs** (`PACE`, `QUALI`).

#159 (condition rules) is independent and can run in parallel. The schedule feed waits on research.

---

## 4. Deliberately open

- **Setup variant lineage** — that variants exist (registered by the session system or by the user) is agreed;
  parent links, diff presentation and naming are not designed. `SetupProgram` has no car, track or parent today.
- **Practice programs as a feature** — described in domain terms (stint phase, prescribed fuel and tyre state,
  N captured laps, fuel-use and tyre-degradation output, repeatable per stint; `QUALI` = 2–3 back-to-back
  hotlaps) but not designed. Only the corpus tag is settled.
- **Chart specifics** — which metrics per stack, where the stack lives (#9/#10 or a dedicated analysis view),
  zoom/pan, and whether two laps can be overlaid.
- **LMU weekly schedule feed** — research handoff written; verdict pending. Presumed shape: `api/` ingests
  once server-side and serves a normalised `RaceEvent`, desktop polls Sprint only, manual entry always remains.
- **Telemetry projection idea** (skip derived work nothing binds — the delta curve, sector maths — driven by a
  layout's binding manifest): parked, measure against the #41 screen-performance instrumentation first.
