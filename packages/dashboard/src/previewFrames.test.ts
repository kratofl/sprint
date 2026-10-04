import test from 'node:test'
import assert from 'node:assert/strict'
import { TirePosition, type TelemetryFrame } from '@sprint/types'
import { dashPreviewStates, previewFrame, resolvePreviewFrame } from './previewFrames'

function liveFrame(): TelemetryFrame {
  return {
    timestamp: 123,
    session: { game: 'LMU', track: 'Le Mans', trackLengthMeters: null, car: '', carClass: '', sessionType: 'race', sessionTime: 0, totalSessionTime: null, sessionTimeRemaining: null, bestLapTime: 0, maxLaps: 0, inCar: true },
    car: { speedMS: 0, gear: 0, rpm: 0, maxRPM: 0, throttle: 0, brake: 0, clutch: 0, steering: 0, fuel: 0, fuelPerLap: 0, positionX: 0, positionY: 0, positionZ: 0, brakeBiasRear: 0.5 },
    tires: [
      { position: TirePosition.FrontLeft, tempInner: 0, tempMiddle: 0, tempOuter: 0, tempSurface: 0, tempCore: 0, pressureKPa: 0, wearPercent: 0, compound: '' },
      { position: TirePosition.FrontRight, tempInner: 0, tempMiddle: 0, tempOuter: 0, tempSurface: 0, tempCore: 0, pressureKPa: 0, wearPercent: 0, compound: '' },
      { position: TirePosition.RearLeft, tempInner: 0, tempMiddle: 0, tempOuter: 0, tempSurface: 0, tempCore: 0, pressureKPa: 0, wearPercent: 0, compound: '' },
      { position: TirePosition.RearRight, tempInner: 0, tempMiddle: 0, tempOuter: 0, tempSurface: 0, tempCore: 0, pressureKPa: 0, wearPercent: 0, compound: '' },
    ],
    lap: { currentLap: 0, currentLapTime: 0, positionLapTime: 0, lastLapTime: 0, bestLapTime: 0, targetLapTime: 0, delta: 0, sector: 0, sector1Time: 0, sector2Time: 0, lastLapSectorsSeconds: [], isInLap: false, isOutLap: false, isValid: true, trackPosition: 0 },
    flags: { yellow: false, doubleYellow: false, red: false, safetyCar: false, vsc: false, checkered: false },
    electronics: { tcActive: false, tc: 0, tcMax: 9, tcCut: 0, tcCutMax: 0, tcSlip: 0, tcSlipMax: 0, absActive: false, abs: 0, absMax: 9, motorMap: 0, motorMapMax: 9, drsActive: false, absAvailable: true, tcAvailable: true, tcCutAvailable: false, tcSlipAvailable: false, motorMapAvailable: true },
    race: { position: 0, totalPositions: 0, gapAhead: 0, gapBehind: 0 },
    energy: { virtualEnergy: 0, virtualEnergyPerLap: 0, soc: 0, regenPower: 0, deployPower: 0 },
    penalties: { incidents: 0, trackLimitSteps: 0, pitStops: 0 },
    conditions: { pathWetness: null, trackGripLevel: null, fuelMultiplier: null, tireMultiplier: null, fixedSetup: null },
  }
}

test('resolvePreviewFrame passes the live frame through unchanged for "live", including null', () => {
  const frame = liveFrame()
  assert.equal(resolvePreviewFrame('live', frame), frame)
  assert.equal(resolvePreviewFrame('live', null), null)
})

test('every non-live preview state is representative of its condition', () => {
  assert.equal(previewFrame('idle').car.rpm, 1100)
  assert.equal(previewFrame('idle').car.speedMS, 0)
  assert.equal(previewFrame('idle').session.inCar, false)

  assert.equal(previewFrame('redline').car.gear, 5)
  assert.ok(previewFrame('redline').car.rpm > previewFrame('redline').car.maxRPM * 0.9)

  assert.ok(previewFrame('low_fuel').car.fuel < previewFrame('low_fuel').car.fuelPerLap)

  assert.equal(previewFrame('yellow_flag').flags.yellow, true)
  assert.equal(previewFrame('yellow_flag').flags.red, false)

  assert.equal(previewFrame('red_flag').flags.red, true)
  assert.equal(previewFrame('red_flag').car.speedMS, 0)

  assert.equal(previewFrame('pit').lap.sector, 3)
  assert.ok(previewFrame('pit').car.speedMS > 0 && previewFrame('pit').car.speedMS < 30)

  // mid_lap is the representative base frame: a normal in-progress racing lap.
  const midLap = previewFrame('mid_lap')
  assert.equal(midLap.session.inCar, true)
  assert.ok(midLap.car.speedMS > 0)
  assert.ok(midLap.lap.currentLapTime > 0)
})

test('resolvePreviewFrame is deterministic (no Date.now/Math.random)', () => {
  const first = resolvePreviewFrame('redline', null)
  const second = resolvePreviewFrame('redline', null)
  assert.deepEqual(first, second)
})

test('the preview-state menu lists every non-live state exactly once, in a stable order', () => {
  const states = dashPreviewStates.map((item) => item.state)
  assert.deepEqual(states, ['live', 'idle', 'mid_lap', 'redline', 'low_fuel', 'yellow_flag', 'red_flag', 'pit'])
  assert.equal(new Set(states).size, states.length)
})
