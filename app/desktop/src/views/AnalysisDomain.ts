import type { LapImportResult, SprintCommand, SprintState } from '../bridge'

/**
 * Analysis domain model, parsing, chart math, and command builders.
 *
 * Hand-mirrored copy of the authoritative C# model in
 * `app/Sprint.Desktop.Core/Features/Analysis/*.cs`,
 * `Features/SessionPlanning/LapHistoryModels.cs` and `LapChannelTrace.cs`, and
 * the chart stack in `Features/Charts/*.cs` — the same convention
 * `DashesDomain.ts` uses for the dash model. If those files change, this one
 * must change with them.
 * <p>
 * `AnalysisController.State()` already computes `CorpusSession`/`CorpusLap`'s
 * `label`/`detail`/`day`/`hasChannels` fields server-side, so this only
 * narrows what the host sends rather than re-deriving them.
 * <p>
 * `/api/state` nests this under `analysis`, which `SprintState` (bridge.ts)
 * does not declare — bridge.ts is out of this view's ownership, so the field
 * is read defensively through `unknown` rather than widening that shared type.
 */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const numberOrNull = (value: unknown): number | null => (typeof value === 'number' ? value : null)

// ── Enums ────────────────────────────────────────────────────────────────

export type HistorySessionKind = 'Practice' | 'Qualifying' | 'Race' | 'Warmup' | 'TestDay' | 'Unknown'
export type LapHistoryOrigin = 'Recorded' | 'Imported' | 'Shared'
export type LapTargetTier = 'TimeOnly' | 'ReferenceCurve' | 'FullTrace'

const isHistorySessionKind = (value: unknown): value is HistorySessionKind =>
  value === 'Practice' || value === 'Qualifying' || value === 'Race' || value === 'Warmup' || value === 'TestDay' || value === 'Unknown'

const isLapHistoryOrigin = (value: unknown): value is LapHistoryOrigin => value === 'Recorded' || value === 'Imported' || value === 'Shared'

const isLapTargetTier = (value: unknown): value is LapTargetTier => value === 'TimeOnly' || value === 'ReferenceCurve' || value === 'FullTrace'

// ── Corpus model (Features/Analysis) ────────────────────────────────────────

/**
 * Where a lap was driven. `carModel` is the car's name, what laps are matched on ("LMP2 ELMS",
 * "LMGT3 Porsche"); `carType` is the game's model ("Oreca 07") and `livery` the entry driven
 * ("DKR Engineering #3"), both null when the game or an older recording didn't say.
 */
export type LapHistoryContext = {
  game: string
  trackCourse: string
  carModel: string
  carType: string | null
  livery: string | null
  trackLengthMeters: number | null
  carClass: string | null
}

export type CorpusSession = {
  id: string
  context: LapHistoryContext
  kind: HistorySessionKind
  origin: LapHistoryOrigin
  startedAt: string
  lapCount: number
  tracedLapCount: number
  bestLapSeconds: number | null
  sharedFrom: string | null
  day: string | null
  label: string
  detail: string
  hasChannels: boolean
  /** How many drives out of the garage its laps came from; 0 when they do not say (imported, shared, older). */
  runs: number
}

export type CorpusLap = {
  sessionId: string
  lapNumber: number
  label: string
  detail: string
  lapTimeSeconds: number
  tier: LapTargetTier
  context: LapHistoryContext
  sessionStartedAt: string | null
  sharedFrom: string | null
  traceId: string
  hasChannels: boolean
  unavailableReason: string | null
  /** The run the lap was driven in (a drive out of the garage); 0 when the source could not tell. */
  outing: number
  frontCompound: string | null
  rearCompound: string | null
  fuelUsedLiters: number | null
  /** When the lap ended; null for imported laps. */
  completedAt: string | null
  /** Notes left on the lap: the driver's own, then any it was shared with. */
  notes: LapNote[]
}

/**
 * A note left at a place on a lap (Features/SessionPlanning/LapHistoryModels.cs `LapNote`, as
 * `CorpusLapNote`). `mine`: the driver wrote it here and may change it; otherwise it came with a
 * shared lap and is read-only.
 */
export type LapNote = { id: string; distanceMeters: number; text: string; author: string; createdAt: string; mine: boolean }

/** The longest note, in characters. Mirrors `LapNote.MaxTextLength`. */
export const LAP_NOTE_MAX_LENGTH = 500

function parseLapNote(value: unknown): LapNote | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.text !== 'string' || typeof value.distanceMeters !== 'number') return null
  return {
    id: value.id,
    distanceMeters: value.distanceMeters,
    text: value.text,
    author: typeof value.author === 'string' ? value.author : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    mine: value.mine === true,
  }
}

/** The setup version a run was driven with, as the driver picked it (Features/Setup/RunSetups.cs). */
export type RunSetup = { snapshotId: string; name: string; setupId: string }

/** One run of the open session: a drive out of the garage and back, so one setup throughout. */
export type CorpusRun = {
  /** The stored outing; 0 for a session that does not know its runs. */
  outing: number
  /** Its place in the session, from 1. */
  number: number
  laps: number
  bestLapSeconds: number
  startedAt: string | null
  setup: RunSetup | null
}

export type AnalysisState = {
  /** Every session, newest first: the sessions list. */
  sessions: CorpusSession[]
  session: CorpusSession | null
  laps: CorpusLap[]
  runs: CorpusRun[]
  /** Every lap with the open session's car on its track, from any session, fastest first. */
  courseLaps: CorpusLap[]
  notice: string | null
}

function parseContext(value: unknown): LapHistoryContext {
  if (!isRecord(value)) return { game: '', trackCourse: '', carModel: '', carType: null, livery: null, trackLengthMeters: null, carClass: null }
  return {
    game: typeof value.game === 'string' ? value.game : '',
    trackCourse: typeof value.trackCourse === 'string' ? value.trackCourse : '',
    carModel: typeof value.carModel === 'string' ? value.carModel : '',
    carType: stringOrNull(value.carType),
    livery: stringOrNull(value.livery),
    trackLengthMeters: numberOrNull(value.trackLengthMeters),
    carClass: stringOrNull(value.carClass),
  }
}

/** "LMP2 ELMS · Oreca 07": the car's name, then its model when that says more. */
export function carLine(context: LapHistoryContext): string {
  const { carModel, carType } = context
  return carType && !carModel.includes(carType) ? `${carModel} · ${carType}` : carModel
}

function parseSession(value: unknown): CorpusSession | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.startedAt !== 'string') return null
  return {
    id: value.id,
    context: parseContext(value.context),
    kind: isHistorySessionKind(value.kind) ? value.kind : 'Unknown',
    origin: isLapHistoryOrigin(value.origin) ? value.origin : 'Recorded',
    startedAt: value.startedAt,
    lapCount: typeof value.lapCount === 'number' ? value.lapCount : 0,
    tracedLapCount: typeof value.tracedLapCount === 'number' ? value.tracedLapCount : 0,
    bestLapSeconds: numberOrNull(value.bestLapSeconds),
    sharedFrom: stringOrNull(value.sharedFrom),
    day: stringOrNull(value.day),
    label: typeof value.label === 'string' ? value.label : 'Session',
    detail: typeof value.detail === 'string' ? value.detail : '',
    hasChannels: value.hasChannels === true,
    runs: typeof value.runs === 'number' ? value.runs : 0,
  }
}

export function parseCorpusLap(value: unknown): CorpusLap | null {
  if (!isRecord(value) || typeof value.sessionId !== 'string' || typeof value.lapNumber !== 'number') return null
  return {
    sessionId: value.sessionId,
    lapNumber: value.lapNumber,
    label: typeof value.label === 'string' ? value.label : `Lap ${value.lapNumber}`,
    detail: typeof value.detail === 'string' ? value.detail : '',
    lapTimeSeconds: typeof value.lapTimeSeconds === 'number' ? value.lapTimeSeconds : 0,
    tier: isLapTargetTier(value.tier) ? value.tier : 'TimeOnly',
    context: parseContext(value.context),
    sessionStartedAt: stringOrNull(value.sessionStartedAt),
    sharedFrom: stringOrNull(value.sharedFrom),
    traceId: typeof value.traceId === 'string' ? value.traceId : `${value.sessionId}/${value.lapNumber}`,
    hasChannels: value.hasChannels === true,
    unavailableReason: stringOrNull(value.unavailableReason),
    outing: typeof value.outing === 'number' ? value.outing : 0,
    frontCompound: stringOrNull(value.frontCompound),
    rearCompound: stringOrNull(value.rearCompound),
    fuelUsedLiters: numberOrNull(value.fuelUsedLiters),
    completedAt: stringOrNull(value.completedAt),
    notes: Array.isArray(value.notes) ? value.notes.map(parseLapNote).filter((note): note is LapNote => note !== null) : [],
  }
}

export function parseRunSetup(value: unknown): RunSetup | null {
  if (!isRecord(value) || typeof value.snapshotId !== 'string' || typeof value.name !== 'string' || typeof value.setupId !== 'string') return null
  return { snapshotId: value.snapshotId, name: value.name, setupId: value.setupId }
}

function parseRun(value: unknown): CorpusRun | null {
  if (!isRecord(value) || typeof value.outing !== 'number' || typeof value.number !== 'number') return null
  return {
    outing: value.outing,
    number: value.number,
    laps: typeof value.laps === 'number' ? value.laps : 0,
    bestLapSeconds: typeof value.bestLapSeconds === 'number' ? value.bestLapSeconds : 0,
    startedAt: stringOrNull(value.startedAt),
    setup: parseRunSetup(value.setup),
  }
}

export const EMPTY_ANALYSIS_STATE: AnalysisState = {
  sessions: [],
  session: null,
  laps: [],
  runs: [],
  courseLaps: [],
  notice: null,
}

/** Narrows `SprintState.analysis` (present on the wire, undeclared on the bridge type) once, at this boundary. */
export function parseAnalysisState(sprint: SprintState): AnalysisState {
  const raw: unknown = sprint
  const record = isRecord(raw) ? raw : {}
  const analysis = record.analysis
  if (!isRecord(analysis)) return EMPTY_ANALYSIS_STATE

  const laps = (value: unknown): CorpusLap[] => (Array.isArray(value) ? value.map(parseCorpusLap).filter((lap): lap is CorpusLap => lap !== null) : [])
  return {
    sessions: Array.isArray(analysis.sessions) ? analysis.sessions.map(parseSession).filter((session): session is CorpusSession => session !== null) : [],
    session: parseSession(analysis.session),
    laps: laps(analysis.laps),
    runs: Array.isArray(analysis.runs) ? analysis.runs.map(parseRun).filter((run): run is CorpusRun => run !== null) : [],
    courseLaps: laps(analysis.courseLaps),
    notice: stringOrNull(analysis.notice),
  }
}

// ── Runs, tyres and fuel (the lap list) ────────────────────────────────────

/** The listed laps under the run each was driven in, runs in the order driven; a run with no listed lap is left out. */
export function lapsByRun(rows: readonly CorpusLap[], runs: readonly CorpusRun[]): Array<{ run: CorpusRun; laps: CorpusLap[] }> {
  return [...runs]
    .sort((a, b) => a.number - b.number)
    .map((run) => ({ run, laps: rows.filter((lap) => lap.outing === run.outing) }))
    .filter((group) => group.laps.length > 0)
}

/** "Run 2", or "All laps" for a session that does not know its runs (imported, or recorded before runs were). */
export const runTitle = (run: CorpusRun): string => (run.outing === 0 ? 'All laps' : `Run ${run.number}`)

/** "Out of the garage 18:04 · 5 laps · best 2:05.400"; the time only when the laps say it. */
export function runLine(run: CorpusRun): string {
  const laps = run.laps === 1 ? '1 lap' : `${run.laps} laps`
  const parts = [laps, `best ${formatLapSeconds(run.bestLapSeconds)}`]
  if (run.outing !== 0 && run.startedAt) parts.unshift(`Out of the garage ${CLOCK.format(new Date(run.startedAt))}`)
  return parts.join(' · ')
}

const CLOCK = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** The tyres as the game named them: "Medium", or "Soft front · Medium rear" when the axles differ. Null when not recorded. */
export function tyreText(front: string | null, rear: string | null): string | null {
  if (front === null && rear === null) return null
  if (front === null || rear === null || front === rear) return front ?? rear
  return `${front} front · ${rear} rear`
}

/** Fuel used over a lap, "3.12 L"; an em dash when it was not measured (the first lap, a refuel, an import). */
export const fuelText = (liters: number | null): string => (liters === null ? '—' : `${liters.toFixed(2)} L`)

// ── Lap stats (the session KPI row) ────────────────────────────────────────

export type LapTimeStats = { count: number; traced: number; best: CorpusLap | null; medianSeconds: number | null }

/** Count, traced count, fastest lap and median lap time of a session's laps. Laps without a time (≤ 0) are left out of the times. */
export function lapTimeStats(laps: readonly CorpusLap[]): LapTimeStats {
  const timed = laps.filter((lap) => lap.lapTimeSeconds > 0)
  const sorted = [...timed].sort((a, b) => a.lapTimeSeconds - b.lapTimeSeconds)
  const middle = Math.floor(sorted.length / 2)
  const medianSeconds =
    sorted.length === 0
      ? null
      : sorted.length % 2 === 1
        ? sorted[middle].lapTimeSeconds
        : (sorted[middle - 1].lapTimeSeconds + sorted[middle].lapTimeSeconds) / 2

  return { count: laps.length, traced: laps.filter((lap) => lap.hasChannels).length, best: sorted[0] ?? null, medianSeconds }
}

/** A lap time to the millisecond, m:ss.mmm — the resolution a two-lap comparison needs. Em dash for no time. */
export function formatLapSeconds(seconds: number | null): string {
  if (seconds === null || !(seconds > 0)) return '—'
  const totalMs = Math.round(seconds * 1000)
  const minutes = Math.floor(totalMs / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(totalMs % 1000).padStart(3, '0')}`
}

/** A signed time gap in seconds, "+0.512 s" / "−0.204 s" (true minus sign). */
export function formatGap(seconds: number): string {
  const rounded = Math.round(seconds * 1000) / 1000
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${Math.abs(rounded).toFixed(3)} s`
}

// ── Lap channel trace (Features/SessionPlanning/LapChannelTrace.cs) ────────

/** Channels on one position grid: index `i` is `i * positionStep` of the lap. */
export type TraceGrid = { positionStep: number; channels: Record<string, number[]> }

/**
 * A lap's driving, and beside it what the car itself reported (`LapTraceCar.cs`: engine, fuel,
 * each wheel corner, damage) on a coarser grid of its own. `car` is null for a lap recorded
 * before the car's readings were kept.
 */
export type LapChannelTrace = TraceGrid & { version: number; trackLengthMeters: number | null; car: TraceGrid | null }

function parseTraceGrid(value: unknown): TraceGrid | null {
  if (!isRecord(value) || typeof value.positionStep !== 'number' || !isRecord(value.channels)) return null

  const channels: Record<string, number[]> = {}
  for (const [name, samples] of Object.entries(value.channels)) {
    if (Array.isArray(samples) && samples.every((sample): sample is number => typeof sample === 'number') && samples.length > 0) {
      channels[name] = samples
    }
  }

  return { positionStep: value.positionStep, channels }
}

/** `/api/analysis/trace/:sessionId/:lapNumber` returns `unknown` on purpose; narrowed once, here. */
export function parseLapChannelTrace(value: unknown): LapChannelTrace | null {
  const grid = parseTraceGrid(value)
  if (grid === null || !isRecord(value)) return null

  const car = parseTraceGrid(value.car)
  return {
    ...grid,
    version: typeof value.version === 'number' ? value.version : 1,
    trackLengthMeters: numberOrNull(value.trackLengthMeters),
    car: car !== null && car.positionStep > 0 && Object.keys(car.channels).length > 0 ? car : null,
  }
}

function traceSampleCount(trace: LapChannelTrace): number {
  const first = Object.values(trace.channels)[0]
  return first ? first.length : 0
}

/** Mirrors `LapChannelTrace.IsUsable`. */
export const isTraceUsable = (trace: LapChannelTrace): boolean => trace.positionStep > 0 && Object.keys(trace.channels).length > 0 && traceSampleCount(trace) > 1

/** Mirrors `LapChannelTrace.ValueAt`: linear interpolation between grid points, null when the channel is absent. */
export function traceValueAt(trace: TraceGrid, channelId: string, position: number): number | null {
  const values = trace.channels[channelId]
  if (!values || values.length === 0 || !(trace.positionStep > 0)) return null

  const exact = Math.min(1, Math.max(0, position)) / trace.positionStep
  const index = Math.floor(exact)
  if (index >= values.length - 1) return values[values.length - 1]
  return values[index] + (values[index + 1] - values[index]) * (exact - index)
}

// ── Chart stack (Features/Charts/*.cs), scoped to the track-position domain
//    Analysis draws a lap comparison on ──────────────────────────────────────

export type ChartSample = { x: number; y: number }
export type ChartSeriesRole = 'Current' | 'Comparison'
export type ChartInterpolation = 'Linear' | 'Stepped'

/**
 * Which colour a line wears: each telemetry channel keeps its own everywhere (`--channel-*`),
 * `other` is the second lap of a comparison, `neutral` a line that is no channel (time gained).
 */
export type SeriesTone = 'speed' | 'throttle' | 'brake' | 'steering' | 'gear' | 'other' | 'neutral' | WheelTone

/** A wheel's line: each corner of the car keeps one colour in every chart of the four (`--channel-fl` …). */
export type WheelTone = 'fl' | 'fr' | 'rl' | 'rr'
/** Solid for a lap's own line, dashed for the lap it is compared with, dotted for what the car got after ABS/TC. */
export type SeriesStroke = 'solid' | 'dashed' | 'dotted'

export type ChartSeries = {
  name: string
  samples: ChartSample[]
  interpolation: ChartInterpolation
  role: ChartSeriesRole
  fillArea: boolean
  tone: SeriesTone
  stroke: SeriesStroke
}

/** The tone a trace channel wears; channels with no colour of their own are neutral. */
export function channelTone(channelId: string): SeriesTone {
  switch (channelId) {
    case 'speedKph':
      return 'speed'
    case 'throttle':
    case 'throttleApplied':
      return 'throttle'
    case 'brake':
    case 'brakeApplied':
      return 'brake'
    case 'steering':
      return 'steering'
    case 'gear':
      return 'gear'
    default:
      return 'neutral'
  }
}

export type ChartPanelState = 'Ready' | 'InsufficientData' | 'Empty'

export type ChartPanel = { title: string; unit: string | null; series: ChartSeries[] }

/** Mirrors `ChartPanel.State`. */
export function chartPanelState(panel: ChartPanel): ChartPanelState {
  if (panel.series.every((series) => series.samples.length === 0)) return 'Empty'
  return panel.series.some((series) => series.samples.length > 1) ? 'Ready' : 'InsufficientData'
}

/**
 * Mirrors `ChartScale.For`: a clean min/max/step instead of the data's raw extremes, so the axis
 * never labels a value nothing measured. `intervals` is how many steps the range is cut into:
 * more gives a tighter fit (the lap charts use 4; the HUD and the lap-times plot keep 2).
 */
export function chartScaleFor(dataMin: number, dataMax: number, intervals = 2): { min: number; max: number; step: number } {
  let min = dataMin
  let max = dataMax
  if (max < min) [min, max] = [max, min]

  if (max - min <= 0) {
    const reach = Math.max(Math.abs(max) * 0.1, 1.0) / 2
    min -= reach
    max += reach
  }

  const step = niceStep((max - min) / intervals)
  return { min: Math.floor(min / step + 1e-9) * step, max: Math.ceil(max / step - 1e-9) * step, step }
}

function niceStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const normalized = raw / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return nice * magnitude
}

export function chartScaleDecimals(step: number): number {
  if (step >= 1) return 0
  if (step >= 0.1) return 1
  return 2
}

export function formatScaleValue(value: number, step: number): string {
  return value.toFixed(chartScaleDecimals(step))
}

/** Mirrors `ChartDomain.TrackPosition().Format`: a whole lap as a percentage. */
export const formatTrackPosition = (fraction: number): string => `${(fraction * 100).toFixed(0)}%`

// ── Chart cursor & readout (mirrors ChartStackController / ChartStackView),
//    scoped to the track-position domain (0..1) buildLapTraceChartPanels draws on ─

/** No cursor, or a cursor resting at a domain coordinate (0..1, track position). */
export type ChartCursorState = { kind: 'none' } | { kind: 'at'; position: number }

export const CHART_CURSOR_NONE: ChartCursorState = { kind: 'none' }

/** Left/Right keyboard nudge, a fraction of the domain span. Mirrors `ContinuousKeyStepFraction`. */
const CURSOR_KEY_STEP = 0.01

/** Mirrors `ChartStackView.OnKeyDown`'s Left/Right handling: nudges the cursor, clamped to the domain (0..1). */
export function moveChartCursorByKey(cursor: ChartCursorState, direction: -1 | 1): ChartCursorState {
  const from = cursor.kind === 'at' ? cursor.position : 0
  return { kind: 'at', position: Math.min(1, Math.max(0, from + direction * CURSOR_KEY_STEP)) }
}

export type ChartSeriesReadout = { name: string; role: ChartSeriesRole; tone: SeriesTone; stroke: SeriesStroke; value: number | null }
export type ChartPanelReadout = { title: string; series: ChartSeriesReadout[] }
export type ChartStackReadout = { position: number; panels: ChartPanelReadout[] }

/**
 * Mirrors `ChartStackController.ValueAt`: the last computed sample at or before `x`, linearly
 * interpolated to the next one (or held, for a stepped series); null outside the series' own
 * range — a series reports nothing where it was never sampled, rather than holding an edge value.
 */
export function chartSeriesValueAt(series: ChartSeries, x: number): number | null {
  const samples = series.samples
  if (samples.length === 0 || x < samples[0].x || x > samples[samples.length - 1].x) return null

  let index = 0
  for (let i = 1; i < samples.length && samples[i].x <= x; i++) index = i

  if (index === samples.length - 1) return samples[index].y

  const start = samples[index]
  const end = samples[index + 1]
  const span = end.x - start.x
  if (series.interpolation === 'Stepped' || span <= 0) return start.y

  return start.y + (end.y - start.y) * ((x - start.x) / span)
}

/** Mirrors `ChartStackController.Read`: every panel's series value at one shared cursor position. */
export function chartStackReadoutAt(panels: readonly ChartPanel[], position: number): ChartStackReadout {
  return {
    position,
    panels: panels.map((panel) => ({
      title: panel.title,
      series: panel.series.map((series) => ({
        name: series.name,
        role: series.role,
        tone: series.tone,
        stroke: series.stroke,
        value: chartSeriesValueAt(series, position),
      })),
    })),
  }
}

/** Mirrors `ChartStackPainter.Decimals`: readout resolution follows the chart's own (clean) value span. */
export function chartReadoutDecimals(scaleSpan: number): number {
  if (scaleSpan >= 20) return 0
  if (scaleSpan >= 2) return 1
  return 2
}

export const formatChartReadoutValue = (value: number, decimals: number): string => value.toFixed(decimals)

/**
 * Mirrors `ChartDomain.Format` for `TrackPosition` (one decimal place) — used for the cursor's
 * own domain label, which carries more resolution than the fixed 0/25/50/75/100% axis ticks
 * `formatTrackPosition` draws (`ChartStackPainter.DrawDomainCursorLabel` vs `DrawAxis`).
 */
export const formatTrackPositionCursor = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`

/** Mirrors `LapCorpusFilter.DayLabel`: "Today"/"Yesterday" are how a driver actually remembers a session. */
export function dayLabel(day: string): string {
  const date = new Date(day)
  if (Number.isNaN(date.getTime())) return day
  const today = new Date()
  const diffDays = Math.round((startOfDay(today).getTime() - startOfDay(date).getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate())

// ── Lap chart panel catalogue (Features/Charts/LapChartPanels.cs) ──────────

export type LapChartChannel = { id: string; displayName: string; scale: number; interpolation: ChartInterpolation }
export type LapChartPanelSpec = { id: string; title: string; unit: string | null; channels: LapChartChannel[]; fillFirst: boolean }

const linear = (id: string, displayName: string, scale = 1): LapChartChannel => ({ id, displayName, scale, interpolation: 'Linear' })

export const LAP_CHART_PANELS = {
  speed: { id: 'speed', title: 'Speed', unit: 'km/h', channels: [linear('speedKph', 'Speed')], fillFirst: false },
  throttle: { id: 'throttle', title: 'Throttle', unit: '%', channels: [linear('throttle', 'Throttle', 100)], fillFirst: false },
  brake: { id: 'brake', title: 'Brake', unit: '%', channels: [linear('brake', 'Brake', 100)], fillFirst: false },
  pedals: {
    id: 'pedals',
    title: 'Throttle & brake',
    unit: '%',
    channels: [linear('brake', 'Brake', 100), linear('throttle', 'Throttle', 100)],
    fillFirst: true,
  },
  steering: { id: 'steering', title: 'Steering', unit: '%', channels: [linear('steering', 'Steering', 100)], fillFirst: false },
  gear: { id: 'gear', title: 'Gear', unit: null, channels: [{ id: 'gear', displayName: 'Gear', scale: 1, interpolation: 'Stepped' as const }], fillFirst: false },
} satisfies Record<string, LapChartPanelSpec>

export const ANALYSIS_DEFAULT_PANELS: readonly LapChartPanelSpec[] = [LAP_CHART_PANELS.speed, LAP_CHART_PANELS.pedals, LAP_CHART_PANELS.steering]

/** Points across a whole lap — mirrors `LapTraceCharts.LapSampleCount`. */
export const LAP_SAMPLE_COUNT = 1000

export type LapTraceSeriesSource = { trace: LapChannelTrace; label: string; role: ChartSeriesRole }

/**
 * Turns lap traces into chart panels. Mirrors `LapTraceCharts.Build`/`BuildPanel`/`Sample`, fixed
 * to the track-position domain (0..1) Analysis draws a lap comparison on — the domain a stretch
 * of track (`TrackDistance`, the Live Compare HUD's case) needs is not built here.
 */
export function buildLapTraceChartPanels(
  sources: readonly LapTraceSeriesSource[],
  panels: readonly LapChartPanelSpec[] = ANALYSIS_DEFAULT_PANELS,
  sampleCount: number = LAP_SAMPLE_COUNT,
): ChartPanel[] {
  // Only name the lap in a series when there is more than one to tell apart.
  const named = sources.length > 1
  const step = 1 / Math.max(1, sampleCount - 1)

  return panels.map((panel) => {
    const series: ChartSeries[] = []
    for (const source of sources) {
      panel.channels.forEach((channel, index) => {
        if (!(channel.id in source.trace.channels)) return

        const samples: ChartSample[] = []
        for (let i = 0; i < sampleCount; i++) {
          const x = i * step
          const value = traceValueAt(source.trace, channel.id, x)
          if (value !== null) samples.push({ x, y: value * channel.scale })
        }

        // The compared-with lap is grey and dashed in every chart, so a colour always means a channel.
        const comparison = source.role === 'Comparison'
        series.push({
          name: named ? `${channel.displayName} · ${source.label}` : channel.displayName,
          samples,
          interpolation: channel.interpolation,
          role: source.role,
          fillArea: panel.fillFirst && index === 0 && !comparison,
          tone: comparison ? 'other' : channelTone(channel.id),
          stroke: comparison ? 'dashed' : 'solid',
        })
      })
    }

    return { title: panel.title, unit: panel.unit, series }
  })
}

// ── Command builders (RuntimeCoordinator: analysis.*) ───────────────────────

export const buildAnalysisSelectSession = (sessionId: string | null): SprintCommand => ({ type: 'analysis.selectSession', sessionId })

/** Puts a setup (its Setups list id) on one run of the open session, or takes it off with null. */
export const buildSetRunSetup = (outing: number, setupId: string | null): SprintCommand => ({ type: 'analysis.setRunSetup', outing, setupId })

/** A note at a place on a lap, metres from the line. The host signs it with the driver name in Settings. */
export const buildAddLapNote = (lap: CorpusLap, distanceMeters: number, text: string): SprintCommand => ({
  type: 'lap.note.add',
  sessionId: lap.sessionId,
  lapNumber: lap.lapNumber,
  distanceMeters,
  text,
})

export const buildUpdateLapNote = (lap: CorpusLap, noteId: string, text: string): SprintCommand => ({
  type: 'lap.note.update',
  sessionId: lap.sessionId,
  lapNumber: lap.lapNumber,
  noteId,
  text,
})

export const buildDeleteLapNote = (lap: CorpusLap, noteId: string): SprintCommand => ({ type: 'lap.note.delete', sessionId: lap.sessionId, lapNumber: lap.lapNumber, noteId })

/** What a page says after a lap file was saved or opened. */
export type LapFileNotice = { tone: 'success' | 'info' | 'error'; title: string; message: string }

/** What opening a friend's `.sprintlap` said, for Analysis and On track alike. Null when cancelled. */
export const importNotice = (result: LapImportResult): LapFileNotice | null => {
  switch (result.outcome) {
    case 'cancelled':
      return null
    case 'failed':
      return { tone: 'error', title: 'Lap file not opened', message: result.error }
    case 'alreadyPresent':
      return { tone: 'info', title: 'Already added', message: `${result.sharedBy}'s ${formatLapSeconds(result.lapTimeSeconds)} at ${result.track} is already in your laps.` }
    case 'imported': {
      const lap = `${result.sharedBy}'s ${formatLapSeconds(result.lapTimeSeconds)} at ${result.track} in the ${result.car}`
      return { tone: 'success', title: 'Lap added', message: `${lap}. It is under ${result.track}.` }
    }
  }
}
