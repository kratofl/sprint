/**
 * What a lap page shows, and in which order: the track map and the car beside the charts, and the
 * charts under each other. One layout for every lap — the driver arranges it once (each chart's ⋯
 * menu, "Add chart", a value on the car) and it stays. Pure: the view keeps it in state and in
 * browser storage (`parseLapLayout` narrows what storage hands back).
 */

/**
 * A chart the lap page can show. `pedals` is throttle and brake, together or as two charts;
 * `settings` is the car's in-car settings (TC, ABS, brake bias, …) along the lap. The rest is
 * what the car itself reported: one line, or one per wheel.
 */
export type LapChartId =
  | 'speed'
  | 'pedals'
  | 'steering'
  | 'gear'
  | 'settings'
  | 'rpm'
  | 'fuel'
  | 'energy'
  | 'tyreTemp'
  | 'tyrePressure'
  | 'tyreWear'
  | 'brakeTemp'
  | 'rideHeight'
  | 'suspension'
  | 'wheelLoad'
  | 'wheelSlip'

/** The charts by part of the car, as "Add chart" lists them: each by its short name under the group's. */
export const LAP_CHART_GROUPS: readonly { title: string; charts: readonly { id: LapChartId; name: string }[] }[] = [
  {
    title: 'Driving',
    charts: [
      { id: 'speed', name: 'Speed' },
      { id: 'pedals', name: 'Throttle & brake' },
      { id: 'steering', name: 'Steering' },
      { id: 'gear', name: 'Gear' },
      { id: 'settings', name: 'Car settings' },
    ],
  },
  {
    title: 'Engine & fuel',
    charts: [
      { id: 'rpm', name: 'RPM' },
      { id: 'fuel', name: 'Fuel' },
      { id: 'energy', name: 'Battery & energy' },
    ],
  },
  {
    title: 'Tyres',
    charts: [
      { id: 'tyreTemp', name: 'Temperature' },
      { id: 'tyrePressure', name: 'Pressure' },
      { id: 'tyreWear', name: 'Wear' },
    ],
  },
  { title: 'Brakes', charts: [{ id: 'brakeTemp', name: 'Temperature' }] },
  {
    title: 'Chassis',
    charts: [
      { id: 'rideHeight', name: 'Ride height' },
      { id: 'suspension', name: 'Suspension travel' },
      { id: 'wheelLoad', name: 'Wheel load' },
    ],
  },
  { title: 'Grip', charts: [{ id: 'wheelSlip', name: 'Wheel slip' }] },
]

export const LAP_CHART_IDS: readonly LapChartId[] = LAP_CHART_GROUPS.flatMap((group) => group.charts.map((chart) => chart.id))

export const LAP_CHART_TITLES: Record<LapChartId, string> = {
  speed: 'Speed',
  pedals: 'Throttle & brake',
  steering: 'Steering',
  gear: 'Gear',
  settings: 'Car settings',
  rpm: 'RPM',
  fuel: 'Fuel',
  energy: 'Battery & energy',
  tyreTemp: 'Tyre temperature',
  tyrePressure: 'Tyre pressure',
  tyreWear: 'Tyre wear',
  brakeTemp: 'Brake temperature',
  rideHeight: 'Ride height',
  suspension: 'Suspension travel',
  wheelLoad: 'Wheel load',
  wheelSlip: 'Wheel slip',
}

/** Where on a tyre its temperature is read: across the tread, or the carcass under it. */
export const TYRE_BANDS = ['Inner', 'Middle', 'Outer', 'Core'] as const
export type TyreBand = (typeof TYRE_BANDS)[number]

export type LapLayout = {
  map: boolean
  /** The car at the cursor, under the map. */
  car: boolean
  /** The charts shown, top to bottom. */
  charts: LapChartId[]
  /** Throttle and brake as two charts instead of one. */
  pedalsSeparate: boolean
  /** Next to the pedals, what reached the car once ABS or TC cut in (dotted). */
  applied: boolean
  /** Which temperature the Tyre temperature chart draws. */
  tyreBand: TyreBand
}

export const DEFAULT_LAP_LAYOUT: LapLayout = {
  map: true,
  car: true,
  charts: ['speed', 'pedals', 'steering', 'gear', 'settings'],
  pedalsSeparate: false,
  applied: true,
  tyreBand: 'Middle',
}

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

/** Onto the page (at the end) or off it: a tick in "Add chart", a value on the car. */
export const toggleChart = (layout: LapLayout, id: LapChartId): LapLayout => (layout.charts.includes(id) ? removeChart(layout, id) : addChart(layout, id))

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isChartId = (value: unknown): value is LapChartId => LAP_CHART_IDS.some((id) => id === value)
const isTyreBand = (value: unknown): value is TyreBand => TYRE_BANDS.some((band) => band === value)

// The charts a layout stored before it recorded which it had seen knew about.
const FIRST_CHARTS: readonly LapChartId[] = ['speed', 'pedals', 'steering', 'gear']

/**
 * A layout as storage keeps it: with the charts it knew about, so a chart that starts on the page
 * and was added in a later version joins it once (at the end) while one the driver removed stays
 * removed. The car's charts start off the page: nobody is handed sixteen charts.
 */
export const storedLapLayout = (layout: LapLayout): LapLayout & { seen: readonly LapChartId[] } => ({ ...layout, seen: LAP_CHART_IDS })

/** A stored layout, or the default when storage holds nothing usable. */
export function parseLapLayout(value: unknown): LapLayout {
  if (!isRecord(value)) return DEFAULT_LAP_LAYOUT
  const record = value
  const charts = Array.isArray(record.charts) ? record.charts.filter(isChartId) : DEFAULT_LAP_LAYOUT.charts
  const seen = Array.isArray(record.seen) ? record.seen.filter(isChartId) : FIRST_CHARTS
  const added = DEFAULT_LAP_LAYOUT.charts.filter((id) => !seen.includes(id))
  return {
    map: typeof record.map === 'boolean' ? record.map : DEFAULT_LAP_LAYOUT.map,
    car: typeof record.car === 'boolean' ? record.car : DEFAULT_LAP_LAYOUT.car,
    charts: [...new Set([...charts, ...added])],
    pedalsSeparate: record.pedalsSeparate === true,
    applied: typeof record.applied === 'boolean' ? record.applied : DEFAULT_LAP_LAYOUT.applied,
    tyreBand: isTyreBand(record.tyreBand) ? record.tyreBand : DEFAULT_LAP_LAYOUT.tyreBand,
  }
}
