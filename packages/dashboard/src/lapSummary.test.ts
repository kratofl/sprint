import test from 'node:test'
import assert from 'node:assert/strict'
import { TirePosition, type TelemetryFrame } from '@sprint/types'
import { LapSummaryWatcher } from './lapSummary'
import { DashAlertTracker } from './alerts'
import { defaultDashPalette } from './palette'
import type { DashLayout } from './index'

function tire(position: TirePosition): TelemetryFrame['tires'][number] {
  return { position, tempInner: 0, tempMiddle: 0, tempOuter: 0, tempSurface: 0, tempCore: 0, pressureKPa: 0, wearPercent: 0, compound: '' }
}

/** A frame on lap `currentLap` with the given last lap time and fuel load. */
function at(currentLap: number, lastLapTime: number, fuel: number, lap: Partial<TelemetryFrame['lap']> = {}): TelemetryFrame {
  return {
    timestamp: 0,
    session: { game: 'LMU', track: 'Le Mans', trackLengthMeters: null, car: '', carClass: '', sessionType: 'race', sessionTime: 0, totalSessionTime: null, sessionTimeRemaining: null, bestLapTime: 0, maxLaps: 0, inCar: true },
    car: { speedMS: 0, gear: 0, rpm: 0, maxRPM: 0, throttle: 0, brake: 0, clutch: 0, steering: 0, fuel, fuelPerLap: 0, positionX: 0, positionY: 0, positionZ: 0, brakeBiasRear: 0.5 },
    tires: [tire(TirePosition.FrontLeft), tire(TirePosition.FrontRight), tire(TirePosition.RearLeft), tire(TirePosition.RearRight)],
    lap: { currentLap, currentLapTime: 0, positionLapTime: 0, lastLapTime, bestLapTime: 0, targetLapTime: 0, delta: 0, sector: 0, sector1Time: 0, sector2Time: 0, lastLapSectorsSeconds: [], isInLap: false, isOutLap: false, isValid: true, trackPosition: 0, ...lap },
    flags: { yellow: false, doubleYellow: false, red: false, safetyCar: false, vsc: false, checkered: false },
    electronics: { tcActive: false, tc: 0, tcMax: 9, tcCut: 0, tcCutMax: 0, tcSlip: 0, tcSlipMax: 0, absActive: false, abs: 0, absMax: 9, motorMap: 0, motorMapMax: 9, drsActive: false, absAvailable: true, tcAvailable: true, tcCutAvailable: false, tcSlipAvailable: false, motorMapAvailable: true },
    race: { position: 0, totalPositions: 0, gapAhead: 0, gapBehind: 0 },
    energy: { virtualEnergy: 0, virtualEnergyPerLap: 0, soc: 0, regenPower: 0, deployPower: 0 },
    penalties: { incidents: 0, trackLimitSteps: 0, pitStops: 0 },
    conditions: { pathWetness: null, trackGripLevel: null, fuelMultiplier: null, tireMultiplier: null, fixedSetup: null },
  }
}

test('a finished lap is reported once its time arrives, against the best before it and the fuel target', () => {
  const watcher = new LapSummaryWatcher()
  watcher.observe(at(3, 0, 60, { bestLapTime: 210 }), 0, 4.4)
  watcher.observe(at(4, 210, 60), 1000, 4.4) // lap 3 finishes in 210; lap 4's fuel is measured from here
  assert.equal(watcher.observe(at(5, 210, 55.5), 2000, 4.4), null, 'the counter moved but the time is still the old lap')
  const summary = watcher.observe(at(5, 209.8, 55.5), 2100, 4.4)
  assert.ok(summary)
  assert.equal(summary.lap, 4)
  assert.equal(summary.lapTime, 209.8)
  assert.ok(Math.abs((summary.lapDelta ?? 0) + 0.2) < 1e-9, 'a new best is negative')
  assert.equal(summary.fuelUsed, 4.5)
  assert.ok(Math.abs((summary.fuelDelta ?? 0) - 0.1) < 1e-9, 'over target is positive')
})

test('a lap whose time is published before the counter moves is still reported', () => {
  const watcher = new LapSummaryWatcher()
  watcher.observe(at(2, 211, 60, { bestLapTime: 211 }), 0, null)
  watcher.observe(at(2, 212.4, 56), 100, null)
  const summary = watcher.observe(at(3, 212.4, 56), 200, null)
  assert.equal(summary?.lapTime, 212.4)
  assert.equal(summary?.fuelUsed, null, 'the lap started before the watcher did')
  assert.equal(summary?.fuelDelta, null)
})

test('an out lap is not reported, and its time is never passed off as the next lap', () => {
  const watcher = new LapSummaryWatcher()
  watcher.observe(at(1, 0, 80, { isOutLap: true }), 0, null)
  assert.equal(watcher.observe(at(2, 0, 76, { isOutLap: false }), 100, null), null)
  assert.equal(watcher.observe(at(2, 250, 76), 200, null), null, 'the out lap time')
  assert.equal(watcher.observe(at(3, 250, 72), 300, null), null, 'no new time yet for lap 2')
  assert.equal(watcher.observe(at(3, 214, 72), 400, null)?.lap, 2)
})

test('an invalid lap is reported but never becomes the best', () => {
  const watcher2 = new LapSummaryWatcher()
  watcher2.observe(at(1, 0, 80, { bestLapTime: 210, isValid: false }), 0, null)
  const cut = watcher2.observe(at(2, 205, 76), 100, null)
  assert.equal(cut?.valid, false)
  watcher2.observe(at(2, 205, 76), 150, null)
  const next = watcher2.observe(at(3, 209, 72), 200, null)
  assert.ok(Math.abs((next?.lapDelta ?? 0) + 1) < 1e-9, 'compared with 210, not the invalid 205')
})

test('the tracker shows the lap summary for five seconds when the layout enables it', () => {
  const layout = (enabled: boolean): DashLayout => ({ id: 'l', name: 'l', default: true, mode: 'basic', gridCols: 20, gridRows: 12, pages: [], alerts: [{ id: 'sum', type: 'lap_summary', enabled, col: 0, row: 0, colSpan: 1, rowSpan: 1 }] })
  for (const enabled of [true, false]) {
    const tracker = new DashAlertTracker()
    tracker.advanceTo(0)
    tracker.evaluate(layout(enabled), at(4, 0, 60, { bestLapTime: 210 }), defaultDashPalette)
    tracker.advanceTo(100)
    const popup = tracker.evaluate(layout(enabled), at(5, 209, 56), defaultDashPalette, { lapTimeSeconds: null, fuelPerLapLiters: 4.4 })
    assert.equal(popup?.kind, enabled ? 'lapSummary' : undefined)
    tracker.advanceTo(5200)
    assert.equal(tracker.evaluate(layout(enabled), at(5, 209, 55), defaultDashPalette), null)
  }
})
