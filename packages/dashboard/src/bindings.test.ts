import test from 'node:test'
import assert from 'node:assert/strict'
import { TirePosition, type TelemetryFrame } from '@sprint/types'
import { noDashTargets, resolveBinding, type DashBindingContext } from './bindings'

function tire(position: TirePosition, tempSurface: number): TelemetryFrame['tires'][number] {
  return { position, tempInner: 0, tempMiddle: 0, tempOuter: 0, tempSurface, tempCore: 0, pressureKPa: 0, wearPercent: 0, compound: '' }
}

const baseFrame: TelemetryFrame = {
  timestamp: 0,
  session: { game: 'LMU', track: 'Le Mans', trackLengthMeters: 13626, car: 'Hypercar', carClass: 'Hypercar', sessionType: 'race', sessionTime: 0, totalSessionTime: null, sessionTimeRemaining: null, bestLapTime: 0, maxLaps: 0, inCar: true },
  car: { speedMS: 50, gear: 4, rpm: 8000, maxRPM: 9000, throttle: 1, brake: 0, clutch: 0, steering: 0, fuel: 42.5, fuelPerLap: 2.75, positionX: 0, positionY: 0, positionZ: 0, brakeBiasRear: 0.5 },
  tires: [tire(TirePosition.FrontLeft, 85.4), tire(TirePosition.FrontRight, 86.1), tire(TirePosition.RearLeft, 90.6), tire(TirePosition.RearRight, 91.5)],
  lap: { currentLap: 3, currentLapTime: 92.345, positionLapTime: 0, lastLapTime: 91.2, bestLapTime: 90.8, targetLapTime: 90.8, delta: -0.5, sector: 2, sector1Time: 30.1, sector2Time: 30.2, lastLapSectorsSeconds: [], isInLap: false, isOutLap: false, isValid: true, trackPosition: 0.5 },
  flags: { yellow: false, doubleYellow: false, red: false, safetyCar: false, vsc: false, checkered: false },
  electronics: { tcActive: true, tc: 3.9, tcMax: 9, tcCut: 0, tcCutMax: 0, tcSlip: 0, tcSlipMax: 0, absActive: false, abs: 2.9, absMax: 9, motorMap: 5.1, motorMapMax: 9, drsActive: false, absAvailable: true, tcAvailable: true, tcCutAvailable: false, tcSlipAvailable: false, motorMapAvailable: true },
  race: { position: 4, totalPositions: 20, gapAhead: 1.234, gapBehind: 0.876 },
  energy: { virtualEnergy: 4500, virtualEnergyPerLap: 210, soc: 0.62, regenPower: 0, deployPower: 120 },
  penalties: { incidents: 0, trackLimitSteps: 0, pitStops: 0 },
  conditions: { pathWetness: null, trackGripLevel: null, fuelMultiplier: null, tireMultiplier: null, fixedSetup: null },
}

function context(overrides: Partial<DashBindingContext> = {}): DashBindingContext {
  return { frame: baseFrame, ...overrides }
}

test('resolves simple session/car/lap fields directly', () => {
  assert.equal(resolveBinding(context(), 'session.track'), 'Le Mans')
  assert.equal(resolveBinding(context(), 'session.car'), 'Hypercar')
  assert.equal(resolveBinding(context(), 'session.game'), 'LMU')
  assert.equal(resolveBinding(context(), 'session.name'), 'race')
  assert.equal(resolveBinding(context(), 'car.gear'), 4)
  assert.equal(resolveBinding(context(), 'lap.current'), 92.345)
  assert.equal(resolveBinding(context(), 'lap.delta'), -0.5)
})

test('rounds car.speed/rpm/maxRpm to the nearest integer, ties to even', () => {
  const frame: TelemetryFrame = { ...baseFrame, car: { ...baseFrame.car, speedMS: 12.5, rpm: 7500.5, maxRPM: 8999.5 } }
  assert.equal(resolveBinding(context({ frame }), 'car.speed'), 45) // 12.5 * 3.6 = 45.0 exactly, no tie
  assert.equal(resolveBinding(context({ frame }), 'car.rpm'), 7500) // 7500.5 ties to the even neighbor (7500)
  assert.equal(resolveBinding(context({ frame }), 'car.maxRpm'), 9000) // 8999.5 ties to the even neighbor (9000)
})

test('car.brakeBiasRear scales the 0-1 fraction to a percentage', () => {
  assert.equal(resolveBinding(context(), 'car.brakeBiasRear'), 50)
})

test('target.* resolves to null when nothing was planned, and to the plan otherwise', () => {
  assert.equal(resolveBinding(context(), 'target.lapTime'), null)
  assert.equal(resolveBinding(context({ targets: noDashTargets }), 'target.fuelPerLapLiters'), null)
  assert.equal(resolveBinding(context({ targets: { lapTimeSeconds: 88.5, fuelPerLapLiters: 2.4 } }), 'target.lapTime'), 88.5)
  assert.equal(resolveBinding(context({ targets: { lapTimeSeconds: 88.5, fuelPerLapLiters: 2.4 } }), 'target.fuelPerLapLiters'), 2.4)
})

test('flags.summary picks the highest-priority active flag', () => {
  const flagged = (flags: Partial<TelemetryFrame['flags']>): TelemetryFrame => ({ ...baseFrame, flags: { ...baseFrame.flags, ...flags } })
  assert.equal(resolveBinding(context({ frame: flagged({}) }), 'flags.summary'), 'GREEN')
  assert.equal(resolveBinding(context({ frame: flagged({ checkered: true }) }), 'flags.summary'), 'CHECKERED')
  assert.equal(resolveBinding(context({ frame: flagged({ yellow: true, checkered: true }) }), 'flags.summary'), 'YELLOW')
  assert.equal(resolveBinding(context({ frame: flagged({ vsc: true, yellow: true }) }), 'flags.summary'), 'VSC')
  assert.equal(resolveBinding(context({ frame: flagged({ safetyCar: true, vsc: true }) }), 'flags.summary'), 'SC')
  assert.equal(resolveBinding(context({ frame: flagged({ red: true, safetyCar: true }) }), 'flags.summary'), 'RED')
})

test('electronics.* truncate toward zero rather than rounding', () => {
  assert.equal(resolveBinding(context(), 'electronics.tc'), 3)
  assert.equal(resolveBinding(context(), 'electronics.abs'), 2)
  assert.equal(resolveBinding(context(), 'electronics.motorMap'), 5)
})

test('tires.* return the full tire reading; the .surfaceTemp variant rounds it', () => {
  assert.deepEqual(resolveBinding(context(), 'tires.fl'), baseFrame.tires[TirePosition.FrontLeft])
  assert.equal(resolveBinding(context(), 'tires.rr.surfaceTemp'), 92) // 91.5 rounds up (92 is even)
  assert.equal(resolveBinding(context(), 'tires.fl.surfaceTemp'), 85) // 85.4 rounds down, no tie
})

test('race.* reads the race state directly (widget catalog binding, not in the C# resolver)', () => {
  assert.equal(resolveBinding(context(), 'race.position'), 4)
  assert.equal(resolveBinding(context(), 'race.gapAhead'), 1.234)
})

test('profile.* reads from settings and is undefined when settings are absent', () => {
  assert.equal(resolveBinding(context(), 'profile.driverName'), undefined)
  assert.equal(resolveBinding(context({ settings: { driverName: 'Luca', driverNumber: '7' } }), 'profile.driverName'), 'Luca')
  assert.equal(resolveBinding(context({ settings: { driverName: 'Luca', driverNumber: '7' } }), 'profile.driverNumber'), '7')
})

test('an unknown binding path resolves to undefined', () => {
  assert.equal(resolveBinding(context(), 'not.a.real.binding'), undefined)
})
