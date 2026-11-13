import assert from 'node:assert/strict'
import { test } from 'node:test'
import { carLine, formatGap, formatLapSeconds, importNotice, lapFileFacts, lapTimeStats, lapsByRun, runLine, runTitle, tyreText } from './AnalysisDomain'
import type { CorpusLap, CorpusRun } from './AnalysisDomain'

function lap(lapNumber: number, lapTimeSeconds: number, hasChannels = false, outing = 0): CorpusLap {
  return {
    sessionId: 'session-1',
    lapNumber,
    label: `Lap ${lapNumber}`,
    detail: '',
    lapTimeSeconds,
    tier: hasChannels ? 'FullTrace' : 'TimeOnly',
    context: { game: 'LMU', trackCourse: 'Spa', carModel: 'Porsche 963', carType: null, livery: null, trackLengthMeters: null, carClass: null },
    sessionStartedAt: null,
    sharedFrom: null,
    traceId: `session-1/${lapNumber}`,
    hasChannels,
    unavailableReason: null,
    outing,
    frontCompound: null,
    rearCompound: null,
    fuelUsedLiters: null,
    completedAt: null,
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

const run = (outing: number, number: number, startedAt: string | null = null): CorpusRun => ({ outing, number, laps: 2, bestLapSeconds: 125.263, startedAt, setup: null })

test('laps sit under the run they were driven in, in the order the runs were driven', () => {
  const rows = [lap(6, 125.2, false, 3), lap(2, 125.4, false, 1), lap(1, 126.9, false, 1)]
  assert.deepEqual(
    lapsByRun(rows, [run(3, 2), run(1, 1), run(5, 3)]).map((group) => [group.run.number, group.laps.map((entry) => entry.lapNumber)]),
    [
      [1, [2, 1]],
      [2, [6]],
    ],
  )
})

test('a run reads as Run N with when it left the garage, or as All laps when the session does not know its runs', () => {
  assert.equal(runTitle(run(2, 2)), 'Run 2')
  assert.equal(runTitle(run(0, 1)), 'All laps')
  assert.match(runLine(run(2, 2, '2026-10-29T18:04:00')), /^Out of the garage 18:04 · 2 laps · best 2:05\.263$/)
  assert.equal(runLine(run(0, 1, '2026-10-29T18:04:00')), '2 laps · best 2:05.263')
})

test('tyres read as one compound, or per axle when they differ', () => {
  assert.equal(tyreText('Medium', 'Medium'), 'Medium')
  assert.equal(tyreText('Soft', 'Medium'), 'Soft front · Medium rear')
  assert.equal(tyreText(null, 'Wet'), 'Wet')
  assert.equal(tyreText(null, null), null)
})

test('a car reads as its name, then its model when the name does not already say it', () => {
  const context = { game: 'LMU', trackCourse: 'Spa', carModel: 'LMP2 ELMS', carType: 'Oreca 07', livery: null, trackLengthMeters: null, carClass: null }
  assert.equal(carLine(context), 'LMP2 ELMS · Oreca 07')
  assert.equal(carLine({ ...context, carType: null }), 'LMP2 ELMS')
  assert.equal(carLine({ ...context, carModel: 'Oreca 07' }), 'Oreca 07')
})

test('an opened lap file lists who, what, where, how fast and when before it is added, and says what the file leaves out', () => {
  const offer = { token: 't', sharedBy: 'Ada Brandt', track: 'Spa', car: 'Porsche 963', lapTimeSeconds: 124.88, drivenAt: '2026-10-02T19:10:00Z', alreadyPresent: false }
  const when = (iso: string) => `at ${iso}`

  assert.deepEqual(
    lapFileFacts(offer, when).map((fact) => [fact.label, fact.value]),
    [['Driver', 'Ada Brandt'], ['Car', 'Porsche 963'], ['Track', 'Spa'], ['Lap time', formatLapSeconds(124.88)], ['Driven', 'at 2026-10-02T19:10:00Z']],
  )
  assert.equal(lapFileFacts({ ...offer, drivenAt: null }, when)[4].value, 'Not in the file')
  assert.equal(importNotice({ outcome: 'failed', error: 'nope' }).title, 'Lap not added')
})
