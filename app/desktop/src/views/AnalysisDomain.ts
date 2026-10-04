import type { SprintCommand, SprintState } from '../bridge'

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

export type LapHistoryContext = { game: string; trackCourse: string; carModel: string; trackLengthMeters: number | null; carClass: string | null }

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
}

export type AnalysisFilterState = {
  game: string | null
  track: string | null
  carClass: string | null
  carModel: string | null
  day: string | null
  games: string[]
  tracks: string[]
  classes: string[]
  carModels: string[]
  days: string[]
  sessions: CorpusSession[]
}

export type AnalysisState = {
  filter: AnalysisFilterState
  session: CorpusSession | null
  laps: CorpusLap[]
  primary: CorpusLap | null
  comparison: CorpusLap | null
  notice: string | null
}

function parseContext(value: unknown): LapHistoryContext {
  if (!isRecord(value)) return { game: '', trackCourse: '', carModel: '', trackLengthMeters: null, carClass: null }
  return {
    game: typeof value.game === 'string' ? value.game : '',
    trackCourse: typeof value.trackCourse === 'string' ? value.trackCourse : '',
    carModel: typeof value.carModel === 'string' ? value.carModel : '',
    trackLengthMeters: numberOrNull(value.trackLengthMeters),
    carClass: stringOrNull(value.carClass),
  }
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
  }
}

function parseLap(value: unknown): CorpusLap | null {
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
  }
}

const EMPTY_FILTER: AnalysisFilterState = {
  game: null,
  track: null,
  carClass: null,
  carModel: null,
  day: null,
  games: [],
  tracks: [],
  classes: [],
  carModels: [],
  days: [],
  sessions: [],
}

function parseFilter(value: unknown): AnalysisFilterState {
  if (!isRecord(value)) return EMPTY_FILTER
  const strings = (input: unknown): string[] => (Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : [])
  const sessions = Array.isArray(value.sessions) ? value.sessions.map(parseSession).filter((session): session is CorpusSession => session !== null) : []
  return {
    game: stringOrNull(value.game),
    track: stringOrNull(value.track),
    carClass: stringOrNull(value.carClass),
    carModel: stringOrNull(value.carModel),
    day: stringOrNull(value.day),
    games: strings(value.games),
    tracks: strings(value.tracks),
    classes: strings(value.classes),
    carModels: strings(value.carModels),
    days: strings(value.days),
    sessions,
  }
}

export const EMPTY_ANALYSIS_STATE: AnalysisState = { filter: EMPTY_FILTER, session: null, laps: [], primary: null, comparison: null, notice: null }

/** Narrows `SprintState.analysis` (present on the wire, undeclared on the bridge type) once, at this boundary. */
export function parseAnalysisState(sprint: SprintState): AnalysisState {
  const raw: unknown = sprint
  const record = isRecord(raw) ? raw : {}
  const analysis = record.analysis
  if (!isRecord(analysis)) return EMPTY_ANALYSIS_STATE

  return {
    filter: parseFilter(analysis.filter),
    session: parseSession(analysis.session),
    laps: Array.isArray(analysis.laps) ? analysis.laps.map(parseLap).filter((lap): lap is CorpusLap => lap !== null) : [],
    primary: parseLap(analysis.primary),
    comparison: parseLap(analysis.comparison),
    notice: stringOrNull(analysis.notice),
  }
}

// ── Lap sidebar filter/sort (AnalysisLapList.cs) ────────────────────────────

export type AnalysisLapFilter = 'All' | 'WithChannels' | 'TimeOnly'
export type AnalysisLapSort = 'Fastest' | 'LapNumber'

export function applyLapListFilter(laps: readonly CorpusLap[], filter: AnalysisLapFilter, sort: AnalysisLapSort): CorpusLap[] {
  const filtered = laps.filter((lap) => (filter === 'WithChannels' ? lap.hasChannels : filter === 'TimeOnly' ? !lap.hasChannels : true))
  const sorted = [...filtered]
  sorted.sort((a, b) => (sort === 'LapNumber' ? a.lapNumber - b.lapNumber : a.lapTimeSeconds - b.lapTimeSeconds))
  return sorted
}

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

export type LapChannelTrace = { version: number; positionStep: number; trackLengthMeters: number | null; channels: Record<string, number[]> }

/** `/api/analysis/trace/:sessionId/:lapNumber` returns `unknown` on purpose; narrowed once, here. */
export function parseLapChannelTrace(value: unknown): LapChannelTrace | null {
  if (!isRecord(value) || typeof value.positionStep !== 'number' || !isRecord(value.channels)) return null

  const channels: Record<string, number[]> = {}
  for (const [name, samples] of Object.entries(value.channels)) {
    if (Array.isArray(samples) && samples.every((sample): sample is number => typeof sample === 'number') && samples.length > 0) {
      channels[name] = samples
    }
  }

  return {
    version: typeof value.version === 'number' ? value.version : 1,
    positionStep: value.positionStep,
    trackLengthMeters: numberOrNull(value.trackLengthMeters),
    channels,
  }
}

function traceSampleCount(trace: LapChannelTrace): number {
  const first = Object.values(trace.channels)[0]
  return first ? first.length : 0
}

/** Mirrors `LapChannelTrace.IsUsable`. */
export const isTraceUsable = (trace: LapChannelTrace): boolean => trace.positionStep > 0 && Object.keys(trace.channels).length > 0 && traceSampleCount(trace) > 1

/** Mirrors `LapChannelTrace.ValueAt`: linear interpolation between grid points, null when the channel is absent. */
function traceValueAt(trace: LapChannelTrace, channelId: string, position: number): number | null {
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

export type ChartSeries = { name: string; samples: ChartSample[]; interpolation: ChartInterpolation; role: ChartSeriesRole; fillArea: boolean }

export type ChartPanelState = 'Ready' | 'InsufficientData' | 'Empty'

export type ChartPanel = { title: string; unit: string | null; series: ChartSeries[] }

/** Mirrors `ChartPanel.State`. */
export function chartPanelState(panel: ChartPanel): ChartPanelState {
  if (panel.series.every((series) => series.samples.length === 0)) return 'Empty'
  return panel.series.some((series) => series.samples.length > 1) ? 'Ready' : 'InsufficientData'
}

/** Mirrors `ChartScale.For`: a clean min/max/step instead of the data's raw extremes, so the axis never labels a value nothing measured. */
export function chartScaleFor(dataMin: number, dataMax: number): { min: number; max: number; step: number } {
  let min = dataMin
  let max = dataMax
  if (max < min) [min, max] = [max, min]

  if (max - min <= 0) {
    const reach = Math.max(Math.abs(max) * 0.1, 1.0) / 2
    min -= reach
    max += reach
  }

  const step = niceStep((max - min) / 2)
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

export type ChartSeriesReadout = { name: string; role: ChartSeriesRole; value: number | null }
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
      series: panel.series.map((series) => ({ name: series.name, role: series.role, value: chartSeriesValueAt(series, position) })),
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
export const ALL_LAP_CHART_PANELS: readonly LapChartPanelSpec[] = [
  LAP_CHART_PANELS.speed,
  LAP_CHART_PANELS.throttle,
  LAP_CHART_PANELS.brake,
  LAP_CHART_PANELS.pedals,
  LAP_CHART_PANELS.steering,
  LAP_CHART_PANELS.gear,
]

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

        series.push({
          name: named ? `${channel.displayName} · ${source.label}` : channel.displayName,
          samples,
          interpolation: channel.interpolation,
          role: source.role,
          fillArea: panel.fillFirst && index === 0,
        })
      })
    }

    return { title: panel.title, unit: panel.unit, series }
  })
}

// ── Command builders (RuntimeCoordinator: analysis.*) ───────────────────────

export const buildAnalysisRefresh = (): SprintCommand => ({ type: 'analysis.refresh' })

export const buildAnalysisSelectSession = (sessionId: string | null): SprintCommand => ({ type: 'analysis.selectSession', sessionId })

export type AnalysisFilterPatch = { track?: string | null; carClass?: string | null; carModel?: string | null; day?: string | null }

export const buildAnalysisFilter = (patch: AnalysisFilterPatch): SprintCommand => ({ type: 'analysis.filter', ...patch })

export const buildAnalysisSelectLap = (role: 'primary' | 'comparison', lapNumber: number | null): SprintCommand => ({
  type: 'analysis.selectLap',
  role,
  lapNumber,
})
