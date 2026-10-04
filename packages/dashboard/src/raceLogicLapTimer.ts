// Small state machine behind the RaceLogic-style purpose display, ported from the desktop
// client's `Features/Dashes/RaceLogicLapTimerPresenter.cs`. It builds a reference truthfully,
// switches to predictive delta-T, and briefly freezes a completed lap at the lap boundary.
//
// Deviation from the source: the C# presenter is driven by `Stopwatch.GetTimestamp()` ticks
// (a platform-dependent frequency); this port takes plain epoch milliseconds instead, since
// that is what a browser clock (`Date.now()`/`performance.now()`) gives a caller. The 3-second
// lap-result hold is expressed in milliseconds accordingly — behavior is otherwise identical.

import type { TelemetryFrame } from '@sprint/types'
import { formatLap } from './format'

export type RaceLogicLapTimerMode = 'rolling' | 'predictive' | 'lapResult'

export interface RaceLogicLapTimerView {
  mode: RaceLogicLapTimerMode
  primary: string
  status: string
  delta: number
  showDeltaBar: boolean
}

const RESULT_DURATION_MS = 3000

/** `{delta:+0.00;-0.00;0.00}` — signed to 2dp, with a literal (not implicit) minus, and a bare "0.00" at zero. */
function formatRaceLogicDelta(delta: number): string {
  if (delta > 0) return `+${delta.toFixed(2)}`
  if (delta < 0) return `-${Math.abs(delta).toFixed(2)}`
  return '0.00'
}

export class RaceLogicLapTimerPresenter {
  private observedLap: number | null = null
  private resultUntil = 0
  private resultLapTime = 0
  private resultDelta = 0

  present(frame: TelemetryFrame, timestampMs: number): RaceLogicLapTimerView {
    const lap = frame.lap
    if (this.observedLap !== null && lap.currentLap > this.observedLap && lap.lastLapTime > 0) {
      this.resultLapTime = lap.lastLapTime
      this.resultDelta = lap.targetLapTime > 0 ? lap.lastLapTime - lap.targetLapTime : 0
      this.resultUntil = timestampMs + RESULT_DURATION_MS
    }

    this.observedLap = lap.currentLap

    if (timestampMs < this.resultUntil) {
      return {
        mode: 'lapResult',
        primary: formatLap(this.resultLapTime),
        status: lap.targetLapTime > 0 ? `${formatRaceLogicDelta(this.resultDelta)} TO REFERENCE` : 'LAP COMPLETE',
        delta: this.resultDelta,
        showDeltaBar: lap.targetLapTime > 0,
      }
    }

    if (lap.targetLapTime <= 0) {
      return {
        mode: 'rolling',
        primary: formatLap(lap.currentLapTime),
        status: lap.isValid ? 'BUILDING REFERENCE' : 'INVALID LAP',
        delta: 0,
        showDeltaBar: false,
      }
    }

    return {
      mode: 'predictive',
      primary: formatRaceLogicDelta(lap.delta),
      status: lap.isValid ? 'PREDICTIVE' : 'INVALID LAP',
      delta: lap.delta,
      showDeltaBar: true,
    }
  }
}
