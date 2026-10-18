import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDelta, formatLapTime, sessionLaps, sessionSummary } from './laps.ts'

test('lap times read as m:ss.mmm, and a missing time as a dash', () => {
  assert.equal(formatLapTime(92.481), '1:32.481')
  assert.equal(formatLapTime(59.9996), '1:00.000')
  assert.equal(formatLapTime(7.05), '0:07.050')
  assert.equal(formatLapTime(0), '—')
  assert.equal(formatLapTime(-1), '—')
  assert.equal(formatDelta(0.3141), '+0.314')
  assert.equal(formatDelta(-1.2), '−1.200')
  assert.equal(formatDelta(0), '±0.000')
})

test('a synced lap history wins: its laps carry sectors and validity', () => {
  const data = JSON.stringify({
    id: 'k1',
    laps: [
      { lapNumber: 2, isValid: true, lapTimeSeconds: 93.1, sectorsSeconds: [30.1, 31, 32], topSpeedKph: 301.2 },
      { lapNumber: 1, isValid: false, lapTimeSeconds: 99.5, sectorsSeconds: [] },
      { lapNumber: 3, lapTimeSeconds: 'n/a' },
    ],
  })
  const streamed = [{ lap: 1, lapTime: 99.4, valid: false, completedAt: 1 }]
  assert.deepEqual(sessionLaps(data, streamed), [
    { lap: 1, time: 99.5, valid: false, sectors: [], topSpeedKph: null },
    { lap: 2, time: 93.1, valid: true, sectors: [30.1, 31, 32], topSpeedKph: 301.2 },
  ])
})

test('before the first sync the laps the API detected in the stream are listed', () => {
  const streamed = [
    { lap: 2, lapTime: 92.2, valid: true, completedAt: 2 },
    { lap: 1, lapTime: 95.0, valid: true, completedAt: 1 },
  ]
  for (const data of ['{}', '', 'not json', '{"laps":"x"}']) {
    assert.deepEqual(
      sessionLaps(data, streamed).map((lap) => [lap.lap, lap.time]),
      [
        [1, 95.0],
        [2, 92.2],
      ],
      data,
    )
  }
})

test('the session summary takes the best valid lap and the fastest moment of either source', () => {
  const laps = [
    { lap: 1, time: 91.0, valid: false, sectors: [], topSpeedKph: null },
    { lap: 2, time: 92.5, valid: true, sectors: [], topSpeedKph: 298 },
    { lap: 3, time: 92.1, valid: true, sectors: [], topSpeedKph: 301 },
  ]
  const samples = [{ timestamp: 10_000, speedKph: 305.4 }, { timestamp: 190_000, speedKph: 120 }]
  assert.deepEqual(sessionSummary(laps, samples), { bestLap: 3, bestTime: 92.1, laps: 3, validLaps: 2, topSpeedKph: 305.4, durationSeconds: 180 })
  assert.deepEqual(sessionSummary([], []), { bestLap: null, bestTime: null, laps: 0, validLaps: 0, topSpeedKph: null, durationSeconds: null })
})
