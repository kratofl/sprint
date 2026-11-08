import { chartScaleFor } from '../views/AnalysisDomain'
import type { ChartInterpolation, ChartSample, ChartSeries, ChartSeriesRole } from '../views/AnalysisDomain'

/** One reading's chart: the target's line and yours, over the stretch of track around the car. */
export type HudChart = { title: string; unit: string | null; series: ChartSeries[] }

/** Which readings the HUD set holds (`settings.liveCompare`). */
export type HudReadingSet = { panelIds: string[]; showDelta: boolean }

/** What every window is told: which window it is, and whether the set is being arranged. */
type HudWindowInfo = { id: string; title: string; arranging: boolean; readings: HudReadingSet }

/**
 * What one training HUD window is sent (electron/hudFeed.ts `hudMessageFor`): the delta, one
 * reading's chart, or the palette shown while arranging.
 */
export type HudMessage =
  | (HudWindowInfo & { kind: 'delta'; targetName: string | null; deltaSeconds: number | null; carMeters: number | null })
  | (HudWindowInfo & { kind: 'chart'; chart: HudChart | null; domain: { min: number; max: number } | null; carMeters: number | null })
  | (HudWindowInfo & { kind: 'arrange' })

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const finiteOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function parseSample(value: unknown): ChartSample | null {
  if (!isRecord(value)) return null
  const x = finiteOrNull(value.x)
  const y = finiteOrNull(value.y)
  return x === null || y === null ? null : { x, y }
}

function parseSeries(value: unknown): ChartSeries | null {
  if (!isRecord(value) || !Array.isArray(value.samples)) return null
  const interpolation: ChartInterpolation = value.interpolation === 'Stepped' ? 'Stepped' : 'Linear'
  const role: ChartSeriesRole = value.role === 'Comparison' ? 'Comparison' : 'Current'
  return {
    name: typeof value.name === 'string' ? value.name : '',
    samples: value.samples.map(parseSample).filter((sample): sample is ChartSample => sample !== null),
    interpolation,
    role,
    fillArea: false,
    tone: 'neutral',
    stroke: role === 'Comparison' ? 'dashed' : 'solid',
  }
}

function parseChart(value: unknown): HudChart | null {
  if (!isRecord(value) || typeof value.title !== 'string' || !Array.isArray(value.series)) return null
  return {
    title: value.title,
    unit: typeof value.unit === 'string' ? value.unit : null,
    series: value.series.map(parseSeries).filter((series): series is ChartSeries => series !== null),
  }
}

function parseReadingSet(value: unknown): HudReadingSet {
  if (!isRecord(value)) return { panelIds: [], showDelta: false }
  return {
    panelIds: Array.isArray(value.panelIds) ? value.panelIds.filter((id): id is string => typeof id === 'string') : [],
    showDelta: value.showDelta === true,
  }
}

/** Narrows a HUD window's message once, at the bridge. Null for anything that is not one. */
export function parseHudMessage(value: unknown): HudMessage | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null
  const info: HudWindowInfo = {
    id: value.id,
    title: typeof value.title === 'string' ? value.title : '',
    arranging: value.arranging === true,
    readings: parseReadingSet(value.readings),
  }
  if (value.kind === 'arrange') return { kind: 'arrange', ...info }
  if (value.kind === 'delta') {
    return {
      kind: 'delta',
      ...info,
      targetName: typeof value.targetName === 'string' ? value.targetName : null,
      deltaSeconds: finiteOrNull(value.deltaSeconds),
      carMeters: finiteOrNull(value.carMeters),
    }
  }
  if (value.kind !== 'chart') return null
  const domain = isRecord(value.domain) ? { min: finiteOrNull(value.domain.min), max: finiteOrNull(value.domain.max) } : null
  return {
    kind: 'chart',
    ...info,
    chart: parseChart(value.panel),
    domain: domain && domain.min !== null && domain.max !== null && domain.max > domain.min ? { min: domain.min, max: domain.max } : null,
    carMeters: finiteOrNull(value.carMeters),
  }
}

/** How the delta reads: "−0.214" ahead, "+0.214" behind, and which of the two it is. */
export function formatDelta(seconds: number | null): { text: string; tone: 'ahead' | 'behind' | 'even' } {
  if (seconds === null) return { text: '—', tone: 'even' }
  const rounded = Math.round(seconds * 1000) / 1000
  if (rounded === 0) return { text: '0.000', tone: 'even' }
  return rounded < 0 ? { text: `−${Math.abs(rounded).toFixed(3)}`, tone: 'ahead' } : { text: `+${rounded.toFixed(3)}`, tone: 'behind' }
}

/**
 * The value axis. Percent readings keep their whole 0–100 range, so a half-pressed pedal is
 * half-way up whatever the stretch of track shows; anything else fits the data on a clean scale.
 */
export function hudValueRange(chart: HudChart): { min: number; max: number } {
  if (chart.unit === '%') return { min: 0, max: 100 }
  const values = chart.series.flatMap((series) => series.samples.map((sample) => sample.y))
  if (values.length === 0) return { min: 0, max: 1 }
  const scale = chartScaleFor(Math.min(...values), Math.max(...values))
  return { min: scale.min, max: scale.max }
}

/** Your value where the car is: the last point of your line, which stops at the car. */
export function liveValue(chart: HudChart): number | null {
  const live = chart.series.find((series) => series.role === 'Current')
  const last = live?.samples[live.samples.length - 1]
  return last ? last.y : null
}

export function formatHudValue(value: number | null, unit: string | null): string {
  if (value === null) return '—'
  if (unit === '%') return `${Math.round(value)}%`
  if (unit === null) return String(Math.round(value))
  return `${Math.round(value)} ${unit}`
}

/** An SVG path through `samples`, stepped or straight between them. */
export function hudLinePath(samples: readonly ChartSample[], stepped: boolean, x: (value: number) => number, y: (value: number) => number): string {
  let path = ''
  samples.forEach((sample, index) => {
    const px = x(sample.x).toFixed(1)
    const py = y(sample.y).toFixed(1)
    if (index === 0) path = `M${px},${py}`
    else if (stepped) path += `H${px}V${py}`
    else path += `L${px},${py}`
  })
  return path
}

/** The target's line: what the look-ahead marks are read off. */
const targetSamples = (chart: HudChart): readonly ChartSample[] => chart.series.find((series) => series.role === 'Comparison')?.samples ?? []

/** Brake pressure the target has to pass for a brake point to count; below it is trail or a brush of the pedal. */
const BRAKE_ON_PERCENT = 10

/** A slowest point has to be this much under the speed at the car to be a corner worth marking. */
const CORNER_DROP_KMH = 15

/** One look-ahead mark: where on the track it is, and what the window's header says about it. */
export type HudMark = { meters: number; label: string }

/**
 * What a reading points at ahead of the car (#195, HUD option C): the target's next brake point
 * on Brake, its slowest point on Speed. Null for any other reading, and when nothing is coming
 * within the window. Both read the target's line, never yours: it is the lap you are chasing.
 */
export function hudMark(id: string, chart: HudChart, carMeters: number | null): HudMark | null {
  if (carMeters === null) return null
  const ahead = targetSamples(chart).filter((sample) => sample.x > carMeters)
  if (id === 'brake') {
    const onset = ahead.find((sample, index) => sample.y >= BRAKE_ON_PERCENT && index > 0 && ahead[index - 1].y < BRAKE_ON_PERCENT)
    if (!onset) return null
    return { meters: onset.x, label: `Brake in ${Math.max(10, Math.round((onset.x - carMeters) / 10) * 10)} m` }
  }
  if (id === 'speed') {
    if (ahead.length < 3) return null
    const slowest = ahead.reduce((low, sample) => (sample.y < low.y ? sample : low))
    // At the edge of the window it is not a corner yet, only where the window ends.
    if (slowest === ahead[ahead.length - 1] || ahead[0].y - slowest.y < CORNER_DROP_KMH) return null
    return { meters: slowest.x, label: `Min ${formatHudValue(slowest.y, chart.unit)}` }
  }
  return null
}

/** One delta reading, where on track it was taken. */
export type DeltaPoint = { meters: number; seconds: number }

/** How far back the trend looks: long enough to span a corner, short enough to still be this one. */
export const DELTA_TREND_METERS = 200

/**
 * Keeps the delta readings the trend needs. A jump backwards is a new lap, which starts over;
 * readings older than twice the trend span are dropped.
 */
export function rememberDelta(history: readonly DeltaPoint[], point: DeltaPoint): DeltaPoint[] {
  const last = history[history.length - 1]
  if (last && point.meters < last.meters - DELTA_TREND_METERS) return [point]
  if (last && point.meters === last.meters && point.seconds === last.seconds) return [...history]
  return [...history.filter((entry) => entry.meters >= point.meters - 2 * DELTA_TREND_METERS), point]
}

/**
 * Gaining or losing over the last `DELTA_TREND_METERS`: the delta now against the delta then.
 * Null until that much track has been driven, and when the change rounds to nothing.
 */
export function deltaTrend(history: readonly DeltaPoint[]): { text: string; tone: 'ahead' | 'behind' } | null {
  const now = history[history.length - 1]
  if (!now) return null
  const then = [...history].reverse().find((entry) => entry.meters <= now.meters - DELTA_TREND_METERS)
  if (!then) return null
  const change = Math.round((now.seconds - then.seconds) * 100) / 100
  if (change === 0) return null
  return change < 0 ? { text: `Gaining ${Math.abs(change).toFixed(2)}`, tone: 'ahead' } : { text: `Losing ${change.toFixed(2)}`, tone: 'behind' }
}
