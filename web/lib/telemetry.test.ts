import test from 'node:test'
import assert from 'node:assert/strict'
import type { LiveSample } from './records.ts'
import { tracePoints } from './telemetry.ts'

// A sample at unix ms `at` going `speedKph`; the other fields do not reach a trace point.
const sample = (at: number, speedKph: number): LiveSample => ({
  timestamp: at,
  lap: 3,
  sector: 2,
  currentLapTime: 41.2,
  lastLapTime: 92.481,
  bestLapTime: 91.903,
  delta: 0.31,
  lapValid: true,
  position: 4,
  speedKph,
  rpm: 8120,
  maxRpm: 9000,
  gear: 5,
  throttle: 1,
  brake: 0,
  steering: -0.05,
  fuel: 38.2,
  trackPosition: 0.42,
  tyreTempFl: 88,
  tyreTempFr: 90,
  tyreTempRl: 84,
  tyreTempRr: 85,
  tyreWearFl: 12,
  tyreWearFr: 14,
  tyreWearRl: 9,
  tyreWearRr: 10,
})

test('a trace breaks its line where samples are missing instead of bridging the gap', () => {
  // 20 Hz, then the desktop drops off for 4 s.
  const samples = [sample(10_000, 200), sample(10_050, 201), sample(14_050, 120), sample(14_100, 121)]

  const points = tracePoints(samples, 14_100, 1_000)

  assert.deepEqual(
    points.map((point) => [point.t, point.speed]),
    [
      [-4.1, 200],
      [-4.05, 201],
      [-2.05, null],
      [-0.05, 120],
      [0, 121],
    ],
  )
})

test('without a gap limit every sample is joined', () => {
  const points = tracePoints([sample(0, 100), sample(60_000, 150)], 0)

  assert.deepEqual(points.map((point) => point.speed), [100, 150])
})
