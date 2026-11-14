import { traceValueAt } from './AnalysisDomain'
import type { TraceGrid, WheelTone } from './AnalysisDomain'
import type { LapChartId } from './AnalysisLapLayout'

/**
 * What the car itself reported along a lap (`LapTraceCar.cs`), read for the lap page: the whole
 * car at one place on the lap (the card under the map), and the per-wheel naming its charts
 * share. Pure. Channel values keep the host's units; a wheel's channel is its name with the
 * corner behind it (`brakeTempFL`).
 */

export const CORNERS = ['FL', 'FR', 'RL', 'RR'] as const
export type Corner = (typeof CORNERS)[number]

export const CORNER_NAMES: Record<Corner, string> = { FL: 'Front left', FR: 'Front right', RL: 'Rear left', RR: 'Rear right' }

/** Each corner keeps one colour in every chart of the four wheels. */
export const CORNER_TONES: Record<Corner, WheelTone> = { FL: 'fl', FR: 'fr', RL: 'rl', RR: 'rr' }

/** How fast a tyre's contact patch slides over the road, m/s: along and across it together. */
export const WHEEL_SLIP = 'slip'

/** The car's readings with the one channel the page derives: each wheel's slip. */
export function withWheelSlip(car: TraceGrid): TraceGrid {
  const channels = { ...car.channels }
  for (const corner of CORNERS) {
    const along = car.channels[`slipLong${corner}`]
    const across = car.channels[`slipLat${corner}`]
    if (along && across) channels[`${WHEEL_SLIP}${corner}`] = along.map((value, index) => Math.hypot(value, across[index] ?? 0))
  }
  return { positionStep: car.positionStep, channels }
}

/**
 * A share (the battery, the virtual energy) comes as 0–1 or as 0–100 depending on the car, which
 * the dash tolerates too: the factor that makes it per cent.
 */
export const percentScale = (values: readonly number[] | undefined): number => (values && values.every((value) => value <= 1.5) ? 100 : 1)

/** A state (a surface, a dent) at a place: the nearest recorded value, never a blend. */
function stateAt(car: TraceGrid, channel: string, position: number): number | null {
  const values = car.channels[channel]
  if (!values || !(car.positionStep > 0)) return null
  return values[Math.min(values.length - 1, Math.max(0, Math.round(position / car.positionStep)))]
}

// `TireSurface` by its number; dry tarmac (and a game that names no surface) is not worth a word.
const SURFACE_WORDS: Record<number, string> = { 2: 'wet', 3: 'grass', 4: 'dirt', 5: 'gravel', 6: 'kerb' }

/** One wheel at one place on the lap. Each reading is null when the lap did not record it. */
export type CornerHere = {
  corner: Corner
  /** Across the tread, °C. */
  inner: number | null
  middle: number | null
  outer: number | null
  pressureKPa: number | null
  brakeCelsius: number | null
  /** Tread left, per cent. */
  treadPercent: number | null
  /** What stands out about the wheel here: off the car, flat, or what it stands on when that is not dry tarmac. */
  state: string | null
}

/** A reading of the whole car, as the card states it; `chart` is the chart a click on it adds. */
export type CarFact = { label: string; text: string; chart: LapChartId | null }

export type CarHere = { corners: CornerHere[]; facts: CarFact[] }

const NOT_RECORDED = '—'

function cornerHere(car: TraceGrid, corner: Corner, position: number): CornerHere {
  const read = (channel: string) => traceValueAt(car, channel + corner, position)
  const surface = stateAt(car, `surface${corner}`, position)
  return {
    corner,
    inner: read('tyreTempInner'),
    middle: read('tyreTempMiddle'),
    outer: read('tyreTempOuter'),
    pressureKPa: read('tyrePressure'),
    brakeCelsius: read('brakeTemp'),
    treadPercent: read('tyreWear'),
    state: stateAt(car, `detached${corner}`, position) ? 'off the car' : stateAt(car, `flat${corner}`, position) ? 'flat' : surface !== null ? (SURFACE_WORDS[surface] ?? null) : null,
  }
}

/** Bodywork and parts in a word: the worst dent round the car, a part that came off, an engine overheating. */
function damageText(car: TraceGrid, position: number): string {
  const dents = Array.from({ length: 8 }, (_, place) => stateAt(car, `dent${place}`, position))
  if (dents.every((dent) => dent === null)) return NOT_RECORDED
  const worst = Math.max(...dents.map((dent) => dent ?? 0))
  const parts = [worst >= 2 ? 'Heavy' : worst > 0 ? 'Light' : null, stateAt(car, 'detachedParts', position) ? 'part off' : null, stateAt(car, 'overheating', position) ? 'overheating' : null].filter(
    (part): part is string => part !== null,
  )
  return parts.length > 0 ? parts.join(' · ') : 'None'
}

/** The mean of the readings that are there, or null with none. */
const mean = (values: readonly (number | null)[]): number | null => {
  const said = values.filter((value): value is number => value !== null)
  return said.length > 0 ? said.reduce((sum, value) => sum + value, 0) / said.length : null
}

/** The whole car at one place on the lap (0–1). */
export function carHere(car: TraceGrid, position: number): CarHere {
  const at = (channel: string) => traceValueAt(car, channel, position)
  const text = (value: number | null, format: (value: number) => string) => (value === null ? NOT_RECORDED : format(value))
  const rideFront = mean([at('rideHeightFL'), at('rideHeightFR')])
  const rideRear = mean([at('rideHeightRL'), at('rideHeightRR')])
  // The hybrid's budget where the car has one, its battery otherwise; a car with neither says nothing.
  const energy = (['virtualEnergy', 'battery'] as const).find((channel) => channel in car.channels)
  const energyValue = energy ? at(energy) : null
  const energyFact: CarFact[] =
    energy && energyValue !== null
      ? [{ label: energy === 'battery' ? 'Battery' : 'Energy', text: `${(energyValue * percentScale(car.channels[energy])).toFixed(0)} %`, chart: 'energy' }]
      : []

  return {
    corners: CORNERS.map((corner) => cornerHere(car, corner, position)),
    facts: [
      { label: 'RPM', text: text(at('rpm'), (value) => Math.round(value).toLocaleString('en')), chart: 'rpm' },
      { label: 'Fuel', text: text(at('fuel'), (value) => `${value.toFixed(1)} L`), chart: 'fuel' },
      ...energyFact,
      {
        label: 'Ride height',
        text: rideFront === null || rideRear === null ? NOT_RECORDED : `${Math.round(rideFront * 1000)} · ${Math.round(rideRear * 1000)} mm`,
        chart: 'rideHeight',
      },
      { label: 'Damage', text: damageText(car, position), chart: null },
    ],
  }
}
