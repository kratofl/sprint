import { chartScaleFor } from '../views/AnalysisDomain'
import type { ChartInterpolation, ChartSample, ChartSeries, ChartSeriesRole } from '../views/AnalysisDomain'

/** One reading's chart: the target's line and yours, over the stretch of track around the car. */
export type HudChart = { title: string; unit: string | null; series: ChartSeries[] }

/** What one training HUD window is sent (electron/hudFeed.ts `hudMessageFor`). */
export type HudMessage =
  | { kind: 'delta'; locked: boolean; targetName: string | null; deltaSeconds: number | null }
  | { kind: 'chart'; locked: boolean; chart: HudChart | null; domain: { min: number; max: number } | null; carMeters: number | null }

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

/** Narrows a HUD window's message once, at the bridge. Null for anything that is not one. */
export function parseHudMessage(value: unknown): HudMessage | null {
  if (!isRecord(value)) return null
  const locked = value.locked === true
  if (value.kind === 'delta') {
    return { kind: 'delta', locked, targetName: typeof value.targetName === 'string' ? value.targetName : null, deltaSeconds: finiteOrNull(value.deltaSeconds) }
  }
  if (value.kind !== 'chart') return null
  const domain = isRecord(value.domain) ? { min: finiteOrNull(value.domain.min), max: finiteOrNull(value.domain.max) } : null
  return {
    kind: 'chart',
    locked,
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
