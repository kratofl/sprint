import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CorpusLap, LapChannelTrace } from './AnalysisDomain'
import { EMPTY_COMPARE_STATE } from './OnTrackDomain'
import type { CompareState } from './OnTrackDomain'
import { LIST_PAGE, comparePair, findCorners, lapKeyOf, referenceFor, resolvePage, timeGained } from './OnTrackLaps'

const lap = (sessionId: string, lapNumber: number, seconds: number, sharedFrom: string | null = null, hasChannels = true): CorpusLap => ({
  sessionId,
  lapNumber,
  label: `Lap ${lapNumber}`,
  detail: '',
  lapTimeSeconds: seconds,
  tier: hasChannels ? 'FullTrace' : 'TimeOnly',
  context: { game: 'LMU', trackCourse: 'Spa', carModel: '963', trackLengthMeters: 7000, carClass: null },
  sessionStartedAt: null,
  sharedFrom,
  traceId: `${sessionId}/${lapNumber}`,
  hasChannels,
  unavailableReason: null,
})

const chase = (picked: CorpusLap) => ({ sessionId: picked.sessionId, lapNumber: picked.lapNumber, label: '', lapTimeSeconds: picked.lapTimeSeconds })

const ada = lap('ada', 3, 124.88, 'Ada')
const best = lap('mine', 5, 125.263)
const next = lap('mine', 1, 125.4)
const timeOnly = lap('mine', 3, 126.0, null, false)
const course: CompareState = { ...EMPTY_COMPARE_STATE, laps: [ada, best, next, timeOnly], lapCount: 4, target: chase(ada) }

test('compare opens on the lap being chased against your best, or your best against the next lap', () => {
  assert.deepEqual(comparePair(course), { first: lapKeyOf(ada), second: lapKeyOf(best) })
  assert.deepEqual(comparePair(course, lapKeyOf(best)), { first: lapKeyOf(best), second: lapKeyOf(ada) })
  assert.equal(comparePair({ ...course, laps: [best, timeOnly] }), null)
})

test('a lap is measured against your best, and your best against the lap being chased', () => {
  assert.equal(referenceFor(course, next), best)
  assert.equal(referenceFor(course, best), ada)
  assert.equal(referenceFor({ ...course, laps: [best], target: null }, best), null)
})

test('a page whose lap is gone, or has no line, falls back to the list', () => {
  assert.deepEqual(resolvePage(course, { kind: 'lap', lap: lapKeyOf(timeOnly) }), LIST_PAGE)
  assert.deepEqual(resolvePage({ ...course, laps: [best] }, { kind: 'compare', first: lapKeyOf(ada), second: lapKeyOf(best) }), LIST_PAGE)
  assert.deepEqual(resolvePage(course, { kind: 'lap', lap: lapKeyOf(next) }), { kind: 'lap', lap: lapKeyOf(next) })
})

// A lap at 11 points: speed dips at 30% and 70%; elapsed time from `seconds` at each point.
const trace = (speed: number[], seconds: number[] | null): LapChannelTrace => ({
  version: 2,
  positionStep: 0.1,
  trackLengthMeters: 7000,
  channels: seconds ? { speedKph: speed, elapsedSeconds: seconds } : { speedKph: speed },
  car: null,
})
const SPEED = [250, 250, 200, 100, 200, 250, 250, 150, 250, 250, 250]

test('time gained is how far ahead the lap is at each point, and needs elapsed time on both laps', () => {
  const quick = trace(SPEED, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  const slow = trace(SPEED, [0, 1, 2, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5])

  const gained = timeGained(quick, slow, 11)
  assert.ok(gained)
  assert.equal(gained[0].y, 0)
  assert.equal(Math.round(gained[10].y * 1000) / 1000, 0.5)
  assert.equal(timeGained(quick, trace(SPEED, null)), null)
})

test('corners are the slow points, and their gains add up to the lap’s', () => {
  const quick = trace(SPEED, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  const slow = trace(SPEED, [0, 1, 2, 3.5, 4.5, 5.5, 6.5, 7.75, 8.75, 9.75, 10.75])

  const corners = findCorners(quick, slow, 11)
  assert.deepEqual(
    corners.map((corner) => [corner.number, corner.position, Math.round(corner.lapMinKph)]),
    [
      [1, 0.3, 100],
      [2, 0.7, 150],
    ],
  )
  assert.deepEqual(
    corners.map((corner) => (corner.gainedSeconds === null ? null : Math.round(corner.gainedSeconds * 1000) / 1000)),
    [0.5, 0.25],
  )
})
