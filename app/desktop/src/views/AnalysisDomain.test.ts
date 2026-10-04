import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatGap, formatLapSeconds, lapTimeStats } from './AnalysisDomain'
import type { CorpusLap } from './AnalysisDomain'

function lap(lapNumber: number, lapTimeSeconds: number, hasChannels = false): CorpusLap {
  return {
    sessionId: 'session-1',
    lapNumber,
    label: `Lap ${lapNumber}`,
    detail: '',
    lapTimeSeconds,
    tier: hasChannels ? 'FullTrace' : 'TimeOnly',
    context: { game: 'LMU', trackCourse: 'Spa', carModel: 'Porsche 963', trackLengthMeters: null, carClass: null },
    sessionStartedAt: null,
    sharedFrom: null,
    traceId: `session-1/${lapNumber}`,
    hasChannels,
    unavailableReason: null,
  }
}

test('lap stats pick the fastest lap and the median of the timed laps', () => {
  const stats = lapTimeStats([lap(1, 127), lap(2, 125.5, true), lap(3, 0), lap(4, 126), lap(5, 130)])
  assert.equal(stats.count, 5)
  assert.equal(stats.traced, 1)
  assert.equal(stats.best?.lapNumber, 2)
  assert.equal(stats.medianSeconds, 126.5)
})

test('lap stats of an empty session have no best and no median', () => {
  assert.deepEqual(lapTimeStats([]), { count: 0, traced: 0, best: null, medianSeconds: null })
})

test('lap times format to the millisecond, and gaps carry a sign', () => {
  assert.equal(formatLapSeconds(125.2634), '2:05.263')
  assert.equal(formatLapSeconds(59.9996), '1:00.000')
  assert.equal(formatLapSeconds(null), '—')
  assert.equal(formatGap(0.5124), '+0.512 s')
  assert.equal(formatGap(-0.2), '−0.200 s')
  assert.equal(formatGap(0.0001), '±0.000 s')
})
