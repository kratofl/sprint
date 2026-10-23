// Detects finished laps for the lap summary popup: the lap time against the best before it,
// and the fuel the lap used against the plan's per-lap target. Pure and clock-free like
// DashAlertTracker, which owns one of these and decides when the popup shows.

import type { TelemetryFrame } from '@sprint/types'

/** What one finished lap came to. Each delta is null when there is nothing to compare against. */
export interface LapSummary {
  lap: number
  lapTime: number
  /** False when the game flagged the lap invalid; it never counts as a best. */
  valid: boolean
  /** Lap time minus the best valid lap before it. Negative is a new best. */
  lapDelta: number | null
  /** Liters the lap used, or null when the lap's start was not seen or the car was refueled. */
  fuelUsed: number | null
  /** Fuel used minus the plan's per-lap target. Positive means over target. */
  fuelDelta: number | null
}

// The game can publish a finished lap's time a few frames after the lap counter moves (see
// the lap history's own wait in the desktop host). Past this, the time is not coming.
const LAP_TIME_WAIT_MS = 3000

interface PendingLap {
  lap: number
  valid: boolean
  fuelUsed: number | null
  /** Out laps are tracked only to absorb their lap time, never reported. */
  report: boolean
  since: number
}

export class LapSummaryWatcher {
  private prev: TelemetryFrame | null = null
  private lapStartFuel: number | null = null
  /** The best valid lap so far, kept here so a lap is compared with the best before it, whenever the game updates its own. */
  private best = 0
  /** The last lap time already matched to a lap, so a stale one is never reported again. */
  private matchedLapTime = 0
  private pending: PendingLap | null = null

  /** Feeds one frame (`now` in epoch ms); returns a summary on the frame the finished lap's time is known. */
  observe(frame: TelemetryFrame, now: number, fuelTargetLiters: number | null): LapSummary | null {
    const prev = this.prev
    this.prev = frame
    if (!prev) {
      this.best = frame.lap.bestLapTime
      this.matchedLapTime = frame.lap.lastLapTime
      return null
    }

    if (frame.lap.currentLap > prev.lap.currentLap && prev.lap.currentLap > 0) {
      const used = this.lapStartFuel === null ? null : this.lapStartFuel - frame.car.fuel
      this.pending = { lap: prev.lap.currentLap, valid: prev.lap.isValid, fuelUsed: used !== null && used >= 0 ? used : null, report: !prev.lap.isOutLap, since: now }
      // Fuel is measured from here on; a lap the watcher joined mid-way reports none.
      this.lapStartFuel = frame.car.fuel
    }

    const pending = this.pending
    if (!pending) return null

    const lapTime = frame.lap.lastLapTime
    if (lapTime > 0 && lapTime !== this.matchedLapTime) {
      this.pending = null
      this.matchedLapTime = lapTime
      const bestBefore = this.best
      if (pending.valid && (bestBefore <= 0 || lapTime < bestBefore)) this.best = lapTime
      if (!pending.report) return null
      return {
        lap: pending.lap,
        lapTime,
        valid: pending.valid,
        lapDelta: bestBefore > 0 ? lapTime - bestBefore : null,
        fuelUsed: pending.fuelUsed,
        fuelDelta: pending.fuelUsed !== null && fuelTargetLiters !== null ? pending.fuelUsed - fuelTargetLiters : null,
      }
    }

    if (now - pending.since > LAP_TIME_WAIT_MS) this.pending = null
    return null
  }

  reset(): void {
    this.prev = null
    this.lapStartFuel = null
    this.pending = null
  }
}
