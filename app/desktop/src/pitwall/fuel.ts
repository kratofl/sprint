import { raceLaps, type SessionPlan } from '../views/SessionPlannerDomain'
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
  state: 'done' | 'current' | 'next'
}

/**
 * The race cut into stints from the plan: its race length (in laps) over a full stint at the
 * plan's fuel per lap and the car's tank. Null without either.
 */
export function planStints(plan: SessionPlan, car: PitWallCar, lapsCompleted: number): Stint[] | null {
  const laps = raceLaps(plan)
  const perLap = plan.fuelPerLapLiters
  if (laps === null || perLap === null || perLap <= 0 || car.fuelCapacityLiters === null) return null
  const stintLaps = Math.max(1, Math.floor(car.fuelCapacityLiters / perLap))
  const current = lapsCompleted + 1
  const stints: Stint[] = []
  for (let first = 1, number = 1; first <= laps; first += stintLaps, number++) {
    const last = Math.min(laps, first + stintLaps - 1)
    stints.push({ number, firstLap: first, lastLap: last, state: last < current ? 'done' : first <= current ? 'current' : 'next' })
  }
  return stints
}

export type StintRow = { label: string; firstLap: number; lastLap: number; state: Stint['state']; count: number }

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
  const rows: StintRow[] = shown.map((stint) => ({ label: String(stint.number), firstLap: stint.firstLap, lastLap: stint.lastLap, state: stint.state, count: 1 }))
  if (rest.length === 1) rows.push({ label: String(rest[0].number), firstLap: rest[0].firstLap, lastLap: rest[0].lastLap, state: 'next', count: 1 })
  if (rest.length > 1) {
    const first = rest[0]
    const last = rest[rest.length - 1]
    rows.push({ label: `${first.number}–${last.number}`, firstLap: first.firstLap, lastLap: last.lastLap, state: 'next', count: rest.length })
  }
  return rows
}
