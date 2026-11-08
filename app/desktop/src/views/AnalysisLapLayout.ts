/**
 * What a lap page shows, and in which order: the track map, and the charts under each other.
 * One layout for every lap — the driver arranges it once (each chart's ⋯ menu, "Add chart") and
 * it stays. Pure: the view keeps it in state and in browser storage (`parseLapLayout` narrows
 * what storage hands back).
 */

/**
 * A chart the lap page can show. `pedals` is throttle and brake, together or as two charts;
 * `settings` is the car's in-car settings (TC, ABS, brake bias, …) along the lap.
 */
export type LapChartId = 'speed' | 'pedals' | 'steering' | 'gear' | 'settings'

export const LAP_CHART_IDS: readonly LapChartId[] = ['speed', 'pedals', 'steering', 'gear', 'settings']

export const LAP_CHART_TITLES: Record<LapChartId, string> = {
  speed: 'Speed',
  pedals: 'Throttle & brake',
  steering: 'Steering',
  gear: 'Gear',
  settings: 'Car settings',
}

export type LapLayout = {
  map: boolean
  /** The charts shown, top to bottom. */
  charts: LapChartId[]
  /** Throttle and brake as two charts instead of one. */
  pedalsSeparate: boolean
  /** Next to the pedals, what reached the car once ABS or TC cut in (dotted). */
  applied: boolean
}

export const DEFAULT_LAP_LAYOUT: LapLayout = { map: true, charts: ['speed', 'pedals', 'steering', 'gear', 'settings'], pedalsSeparate: false, applied: true }

export const removeChart = (layout: LapLayout, id: LapChartId): LapLayout => ({ ...layout, charts: layout.charts.filter((chart) => chart !== id) })

/** Puts a removed chart back at the end. */
export const addChart = (layout: LapLayout, id: LapChartId): LapLayout => (layout.charts.includes(id) ? layout : { ...layout, charts: [...layout.charts, id] })

/** Moves a chart one place up (-1) or down (1); at either end it stays. */
export function moveChart(layout: LapLayout, id: LapChartId, direction: -1 | 1): LapLayout {
  const from = layout.charts.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= layout.charts.length) return layout
  const charts = [...layout.charts]
  charts[from] = charts[to]
  charts[to] = id
  return { ...layout, charts }
}

/** The charts not on the page, in their usual order: what "Add chart" offers. */
export const hiddenCharts = (layout: LapLayout): LapChartId[] => LAP_CHART_IDS.filter((id) => !layout.charts.includes(id))

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isChartId = (value: unknown): value is LapChartId => LAP_CHART_IDS.some((id) => id === value)

// The charts a layout stored before it recorded which it had seen knew about.
const FIRST_CHARTS: readonly LapChartId[] = ['speed', 'pedals', 'steering', 'gear']

/**
 * A layout as storage keeps it: with the charts it knew about, so a chart added in a later
 * version joins it once (at the end) while one the driver removed stays removed.
 */
export const storedLapLayout = (layout: LapLayout): LapLayout & { seen: readonly LapChartId[] } => ({ ...layout, seen: LAP_CHART_IDS })

/** A stored layout, or the default when storage holds nothing usable. */
export function parseLapLayout(value: unknown): LapLayout {
  if (!isRecord(value)) return DEFAULT_LAP_LAYOUT
  const record = value
  const charts = Array.isArray(record.charts) ? record.charts.filter(isChartId) : DEFAULT_LAP_LAYOUT.charts
  const seen = Array.isArray(record.seen) ? record.seen.filter(isChartId) : FIRST_CHARTS
  const added = LAP_CHART_IDS.filter((id) => !seen.includes(id))
  return {
    map: typeof record.map === 'boolean' ? record.map : DEFAULT_LAP_LAYOUT.map,
    charts: [...new Set([...charts, ...added])],
    pedalsSeparate: record.pedalsSeparate === true,
    applied: typeof record.applied === 'boolean' ? record.applied : DEFAULT_LAP_LAYOUT.applied,
  }
}
