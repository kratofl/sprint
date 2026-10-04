import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TirePosition } from '@sprint/types'
import { parseHostFrame } from './telemetryFrame'

// Trimmed from a real `/api/state` capture: C# property names, enums as names, ISO timestamp.
const hostFrame = {
  timestamp: '2026-10-01T19:42:46.1283657+00:00',
  session: { game: 'LMU', track: 'Spa', sessionType: 'Race', inCar: true, trackLengthMeters: null },
  car: { speedMetersPerSecond: 50, gear: 4, rpm: 8000, maxRpm: 9000, fuelLiters: 42.5, fuelPerLapLiters: 2.75 },
  tires: [
    { position: 'RearRight', tempSurfaceCelsius: 92 },
    { position: 'FrontLeft', tempSurfaceCelsius: 86, pressureKPa: 165 },
  ],
  lap: { currentLap: 3, isValid: false, lastLapSectorsSeconds: [30.1, 40.2, 'x'] },
  flags: { virtualSafetyCar: true },
  electronics: { tractionControl: 3, tractionControlMax: 10, abs: 0, absMax: 0 },
  energy: { stateOfCharge: 0.5 },
}

test('host frame maps to the dash renderer shape', () => {
  const frame = parseHostFrame(hostFrame)
  assert.ok(frame)
  assert.equal(frame.timestamp, Date.parse('2026-10-01T19:42:46.128Z'))
  assert.equal(frame.session.sessionType, 'race')
  assert.deepEqual(
    [frame.car.speedMS, frame.car.maxRPM, frame.car.fuel, frame.car.fuelPerLap],
    [50, 9000, 42.5, 2.75],
  )
  assert.equal(frame.flags.vsc, true)
  assert.equal(frame.energy.soc, 0.5)
  assert.deepEqual([frame.electronics.tc, frame.electronics.tcAvailable, frame.electronics.absAvailable], [3, true, false])
  assert.equal(frame.lap.isValid, false)
  assert.deepEqual(frame.lap.lastLapSectorsSeconds, [30.1, 40.2, 0])
})

test('tyres land at their TirePosition index, missing ones are zeroed', () => {
  const frame = parseHostFrame(hostFrame)
  assert.ok(frame)
  assert.equal(frame.tires[TirePosition.FrontLeft].tempSurface, 86)
  assert.equal(frame.tires[TirePosition.RearRight].tempSurface, 92)
  assert.equal(frame.tires[TirePosition.FrontRight].pressureKPa, 0)
  assert.equal(frame.tires[TirePosition.RearLeft].position, TirePosition.RearLeft)
})

test('no frame stays no frame', () => {
  assert.equal(parseHostFrame(null), null)
  assert.equal(parseHostFrame('frame'), null)
})
