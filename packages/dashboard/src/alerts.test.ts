import test from 'node:test'
import assert from 'node:assert/strict'
import { TirePosition, type TelemetryFrame } from '@sprint/types'
import { DashAlertTracker, isAttentionInverted } from './alerts'
import { defaultDashPalette, findPresetByAlertColorToken, presetSwatchColor } from './palette'
import type { DashAlert, DashLayout } from './index'

function assertDefined<T>(value: T | null | undefined): asserts value is T {
  assert.ok(value)
}

function tire(position: TirePosition): TelemetryFrame['tires'][number] {
  return { position, tempInner: 0, tempMiddle: 0, tempOuter: 0, tempSurface: 0, tempCore: 0, pressureKPa: 0, wearPercent: 0, compound: '' }
}

function frame(overrides: Partial<TelemetryFrame['electronics']> = {}): TelemetryFrame {
  return {
    timestamp: 0,
    session: { game: 'LMU', track: 'Le Mans', trackLengthMeters: null, car: '', carClass: '', sessionType: 'race', sessionTime: 0, totalSessionTime: null, sessionTimeRemaining: null, bestLapTime: 0, maxLaps: 0, inCar: true },
    car: { speedMS: 0, gear: 0, rpm: 0, maxRPM: 0, throttle: 0, brake: 0, clutch: 0, steering: 0, fuel: 0, fuelPerLap: 0, positionX: 0, positionY: 0, positionZ: 0, brakeBiasRear: 0.5 },
    tires: [tire(TirePosition.FrontLeft), tire(TirePosition.FrontRight), tire(TirePosition.RearLeft), tire(TirePosition.RearRight)],
    lap: { currentLap: 0, currentLapTime: 0, positionLapTime: 0, lastLapTime: 0, bestLapTime: 0, targetLapTime: 0, delta: 0, sector: 0, sector1Time: 0, sector2Time: 0, lastLapSectorsSeconds: [], isInLap: false, isOutLap: false, isValid: true, trackPosition: 0 },
    flags: { yellow: false, doubleYellow: false, red: false, safetyCar: false, vsc: false, checkered: false },
    electronics: { tcActive: false, tc: 0, tcMax: 9, tcCut: 0, tcCutMax: 0, tcSlip: 0, tcSlipMax: 0, absActive: false, abs: 0, absMax: 9, motorMap: 0, motorMapMax: 9, drsActive: false, absAvailable: true, tcAvailable: true, tcCutAvailable: false, tcSlipAvailable: false, motorMapAvailable: true, ...overrides },
    race: { position: 0, totalPositions: 0, gapAhead: 0, gapBehind: 0 },
    energy: { virtualEnergy: 0, virtualEnergyPerLap: 0, soc: 0, regenPower: 0, deployPower: 0 },
    penalties: { incidents: 0, trackLimitSteps: 0, pitStops: 0 },
    conditions: { pathWetness: null, trackGripLevel: null, fuelMultiplier: null, tireMultiplier: null, fixedSetup: null },
  }
}

function alert(overrides: Partial<DashAlert> = {}): DashAlert {
  return { id: 'a1', type: 'tc_change', enabled: true, col: 6, row: 3, colSpan: 8, rowSpan: 6, ...overrides }
}

function layout(alerts: DashAlert[], overrides: Partial<DashLayout> = {}): DashLayout {
  return { id: 'l1', name: 'Layout', default: true, mode: 'basic', gridCols: 20, gridRows: 12, pages: [], alerts, ...overrides }
}

test('no banner on the first frame — there is nothing to diff against yet', () => {
  const tracker = new DashAlertTracker()
  const result = tracker.evaluate(layout([alert()]), frame({ tc: 5 }), defaultDashPalette)
  assert.equal(result, null)
})

test('a tc_change fires once the value differs from the previous frame', () => {
  const tracker = new DashAlertTracker()
  tracker.evaluate(layout([alert()]), frame({ tc: 0 }), defaultDashPalette)
  const banner = tracker.evaluate(layout([alert()]), frame({ tc: 5 }), defaultDashPalette)
  assertDefined(banner)
  assert.equal(banner.title, 'TRACTION CONTROL')
  assert.equal(banner.value, '5')
  assert.equal(banner.color, defaultDashPalette.assistActive)
  assert.equal(banner.condition, 'assistActive')
})

test('a disabled alert never fires', () => {
  const tracker = new DashAlertTracker()
  tracker.evaluate(layout([alert({ enabled: false })]), frame({ tc: 0 }), defaultDashPalette)
  const banner = tracker.evaluate(layout([alert({ enabled: false })]), frame({ tc: 5 }), defaultDashPalette)
  assert.equal(banner, null)
})

test('the banner expires after its duration and advanceTo drives that clock', () => {
  const tracker = new DashAlertTracker()
  tracker.advanceTo(0)
  tracker.evaluate(layout([alert({ durationSeconds: 1 })]), frame({ tc: 0 }), defaultDashPalette)
  tracker.advanceTo(100)
  const active = tracker.evaluate(layout([alert({ durationSeconds: 1 })]), frame({ tc: 5 }), defaultDashPalette)
  assert.ok(active)

  tracker.advanceTo(900) // still within the 1s duration counted from the firing frame (t=100)
  assert.ok(tracker.evaluate(layout([alert({ durationSeconds: 1 })]), frame({ tc: 5 }), defaultDashPalette))

  tracker.advanceTo(1200) // now past 100 + 1000ms
  assert.equal(tracker.evaluate(layout([alert({ durationSeconds: 1 })]), frame({ tc: 5 }), defaultDashPalette), null)
})

test('the last configured alert that fires this frame wins', () => {
  const tracker = new DashAlertTracker()
  const alerts = [alert({ id: 'tc', type: 'tc_change' }), alert({ id: 'abs', type: 'abs_change' })]
  tracker.evaluate(layout(alerts), frame({ tc: 0, abs: 0 }), defaultDashPalette)
  const banner = tracker.evaluate(layout(alerts), frame({ tc: 5, abs: 5 }), defaultDashPalette)
  assert.equal(banner?.title, 'ABS')
})

test('reset clears the diff baseline so the next frame cannot fire on a stale comparison', () => {
  const tracker = new DashAlertTracker()
  tracker.evaluate(layout([alert()]), frame({ tc: 0 }), defaultDashPalette)
  tracker.reset()
  const banner = tracker.evaluate(layout([alert()]), frame({ tc: 5 }), defaultDashPalette)
  assert.equal(banner, null) // this frame becomes the new baseline instead of a diff target
})

test('an alert duration is clamped to [0.5, 5.0] seconds', () => {
  const tracker = new DashAlertTracker()
  tracker.advanceTo(0)
  tracker.evaluate(layout([alert({ durationSeconds: 10 })]), frame({ tc: 0 }), defaultDashPalette)
  tracker.evaluate(layout([alert({ durationSeconds: 10 })]), frame({ tc: 5 }), defaultDashPalette)
  tracker.advanceTo(4999)
  assert.ok(tracker.evaluate(layout([alert({ durationSeconds: 10 })]), frame({ tc: 5 }), defaultDashPalette))
  tracker.advanceTo(5001)
  assert.equal(tracker.evaluate(layout([alert({ durationSeconds: 10 })]), frame({ tc: 5 }), defaultDashPalette), null)
})

test("a named color token resolves to that theme preset's swatch, overriding the fallback color", () => {
  const tracker = new DashAlertTracker()
  tracker.evaluate(layout([alert({ colorToken: 'green' })]), frame({ tc: 0 }), defaultDashPalette)
  const banner = tracker.evaluate(layout([alert({ colorToken: 'green' })]), frame({ tc: 5 }), defaultDashPalette)
  // "green" canonicalizes to the Viper preset, whose primary swatch is the dash green —
  // not palette.assistActive, which is what tc_change would otherwise fall back to.
  const viper = findPresetByAlertColorToken('green')
  assertDefined(viper)
  assert.equal(banner?.color, presetSwatchColor(viper))
  assert.notEqual(banner?.color, defaultDashPalette.assistActive)
})

test('isAttentionInverted only blinks for the critical condition, and only when requested', () => {
  assert.equal(isAttentionInverted('critical', false, 1000), false)
  assert.equal(isAttentionInverted('warning', true, 1000), false)
  assert.equal(isAttentionInverted('critical', true, -1), false)
})

test('isAttentionInverted alternates every 250ms (two cycles per second)', () => {
  assert.equal(isAttentionInverted('critical', true, 0), false)
  assert.equal(isAttentionInverted('critical', true, 249), false)
  assert.equal(isAttentionInverted('critical', true, 250), true)
  assert.equal(isAttentionInverted('critical', true, 499), true)
  assert.equal(isAttentionInverted('critical', true, 500), false)
})
