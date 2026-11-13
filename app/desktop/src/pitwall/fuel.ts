import type { RaceFuelEstimate } from '../bridge'
import type { PitWallCar } from './pitWallData'

// Fuel, energy and the stints, worked out for the fuel and stint tiles. Pure.

export type Range = {
  /** Laps the fuel lasts at this lap's rate; null without a rate. */
  fuelLaps: number | null
  /** Laps the virtual energy lasts; null when the car has none (or no rate yet). */
  energyLaps: number | null
  /** Which runs out first; null when only one (or neither) is known. */
  limit: 'fuel' | 'energy' | null
  /** The laps the car can still do: the smaller of the two. */
  laps: number | null
}

const per = (amount: number | null, perLap: number | null): number | null =>
  amount !== null && perLap !== null && perLap > 0 && amount >= 0 ? amount / perLap : null

export function range(car: PitWallCar): Range {
  const fuelLaps = per(car.fuelLiters, car.fuelPerLapLiters)
  const energyLaps = per(car.virtualEnergy, car.virtualEnergyPerLap)
  const limit = fuelLaps !== null && energyLaps !== null ? (energyLaps < fuelLaps ? 'energy' : 'fuel') : null
  const known = [fuelLaps, energyLaps].filter((laps): laps is number => laps !== null)
  return { fuelLaps, energyLaps, limit, laps: known.length > 0 ? Math.min(...known) : null }
}

/** Laps a full car lasts: a full tank (and full energy) at this lap's rate; null when the tank size is unknown. */
export function fullStintLaps(car: PitWallCar): number | null {
  const fuel = per(car.fuelCapacityLiters, car.fuelPerLapLiters)
  const energy = per(car.virtualEnergy === null ? null : 1, car.virtualEnergyPerLap)
  const known = [fuel, energy].filter((laps): laps is number => laps !== null)
  return known.length > 0 ? Math.min(...known) : null
}

export type Strategy = {
  /** The lap to box on: the last whole lap the car can finish. */
  boxLap: number
  /** Stops still needed to reach the flag; null without the race length or a full stint. */
  stopsLeft: number | null
  /** Laps to spare at the flag with those stops (negative: short); null when unknown. */
  spareLaps: number | null
}

/**
 * When to box and what it takes to the flag. `lapsCompleted` is the car's, `lapsLeft` the race's
 * (null when unknown). Stops fill to a full stint.
 */
export function strategy(car: PitWallCar, lapsCompleted: number, lapsLeft: number | null): Strategy | null {
  const now = range(car).laps
  if (now === null) return null
  const boxLap = lapsCompleted + Math.max(0, Math.floor(now))
  const full = fullStintLaps(car)
  if (lapsLeft === null || full === null || full <= 0) return { boxLap, stopsLeft: null, spareLaps: null }
  const stopsLeft = lapsLeft <= now ? 0 : Math.ceil((lapsLeft - now) / full)
  return { boxLap, stopsLeft, spareLaps: now + stopsLeft * full - lapsLeft }
}

export type Stint = {
  /** 1-based. */
  number: number
  firstLap: number
  lastLap: number
  /** The litres the planner puts in for it. */
  liters: number
  state: 'done' | 'current' | 'next'
}

/**
 * The race's stints as the driver's planner cut them (`RaceFuelEstimate`: the race's laps, a full
 * tank's laps and the litres per stint), laid over the race's laps. The reserve rides in the last
 * stint, so when it costs a stop of its own the stint before ends early enough to leave that one a
 * lap. Null until the planner has stints.
 */
export function planStints(fuel: RaceFuelEstimate, lapsCompleted: number): Stint[] | null {
  const laps = fuel.laps
  if (laps === null || laps <= 0 || fuel.stints === null) return null
  const { lapsPerStint, liters } = fuel.stints
  const count = Math.min(liters.length, laps)
  const current = lapsCompleted + 1
  const stints: Stint[] = []
  for (let number = 1, first = 1; number <= count; number++) {
    const last = number === count ? laps : Math.min(first + lapsPerStint - 1, laps - (count - number))
    stints.push({ number, firstLap: first, lastLap: last, liters: liters[number - 1], state: last < current ? 'done' : first <= current ? 'current' : 'next' })
    first = last + 1
  }
  return stints
}

/** A row of the stint tile: one stint, or the later ones folded together (`count`, their litres summed). */
export type StintRow = { label: string; firstLap: number; lastLap: number; liters: number; state: Stint['state']; count: number }

/**
 * What the stint tile lists: the stint before the current one, the current one and the next two
 * each on a row, then the rest folded into one ("5–7").
 */
export function stintRows(stints: readonly Stint[]): StintRow[] {
  const current = stints.findIndex((stint) => stint.state === 'current')
  // Past the last planned lap every stint is done: the list ends on the last one.
  const at = current >= 0 ? current : stints.every((stint) => stint.state === 'done') ? stints.length - 1 : 0
  const from = Math.max(0, at - 1)
  const shown = stints.slice(from, at + 3)
  const rest = stints.slice(at + 3)
  const rows: StintRow[] = shown.map((stint) => ({ label: String(stint.number), firstLap: stint.firstLap, lastLap: stint.lastLap, liters: stint.liters, state: stint.state, count: 1 }))
  if (rest.length === 1) rows.push({ label: String(rest[0].number), firstLap: rest[0].firstLap, lastLap: rest[0].lastLap, liters: rest[0].liters, state: 'next', count: 1 })
  if (rest.length > 1) {
    const first = rest[0]
    const last = rest[rest.length - 1]
    const liters = rest.reduce((sum, stint) => sum + stint.liters, 0)
    rows.push({ label: `${first.number}–${last.number}`, firstLap: first.firstLap, lastLap: last.lastLap, liters, state: 'next', count: rest.length })
  }
  return rows
}
