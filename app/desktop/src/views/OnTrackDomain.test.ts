import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CorpusLap } from './AnalysisDomain'
import { EMPTY_COMPARE_STATE, buildToggleReading, chasingFacts, listedLaps, ownLapCount } from './OnTrackDomain'
import type { CompareState } from './OnTrackDomain'

test('a reading turned on takes its place in the column, not the end of it', () => {
  const readings = { panelIds: ['throttle', 'speed'], showDelta: true }

  assert.deepEqual(buildToggleReading(readings, 'brake'), { type: 'compare.readings', panelIds: ['throttle', 'brake', 'speed'], showDelta: true })
  assert.deepEqual(buildToggleReading(readings, 'throttle'), { type: 'compare.readings', panelIds: ['speed'], showDelta: true })
  assert.deepEqual(buildToggleReading(readings, 'delta'), { type: 'compare.readings', panelIds: ['throttle', 'speed'], showDelta: false })
})

const lap = (sessionId: string, lapNumber: number, seconds: number, sharedFrom: string | null = null): CorpusLap => ({
  sessionId,
  lapNumber,
  label: `Lap ${lapNumber}`,
  detail: '',
  lapTimeSeconds: seconds,
  tier: 'FullTrace',
  context: { game: 'LMU', trackCourse: 'Spa', carModel: '963', carType: null, livery: null, trackLengthMeters: 7004, carClass: null },
  sessionStartedAt: null,
  sharedFrom,
  traceId: `${sessionId}/${lapNumber}`,
  hasChannels: true,
  unavailableReason: null,
})

const target = (picked: CorpusLap) => ({ sessionId: picked.sessionId, lapNumber: picked.lapNumber, label: 'host label', lapTimeSeconds: picked.lapTimeSeconds })

test('the page lists your five fastest, every friend’s lap, and the lap being chased wherever it ranks', () => {
  const own = [1, 2, 3, 4, 5, 6, 7].map((number) => lap('mine', number, 120 + number))
  const ada = lap('ada', 1, 130, 'Ada')
  const compare: CompareState = { ...EMPTY_COMPARE_STATE, laps: [...own, ada], lapCount: 40, target: target(own[6]) }

  assert.deepEqual(listedLaps(compare).map((listed) => `${listed.sessionId}/${listed.lapNumber}`), ['mine/1', 'mine/2', 'mine/3', 'mine/4', 'mine/5', 'mine/7', 'ada/1'])
  assert.equal(ownLapCount(compare), 39)
})

test('Chasing names a friend’s lap by them and says how it compares with your best', () => {
  const best = lap('mine', 5, 125.263)
  const ada = lap('ada', 3, 124.88, 'Ada')
  const when = (chased: CorpusLap) => chased.sharedFrom ?? `Lap ${chased.lapNumber}`
  const compare: CompareState = { ...EMPTY_COMPARE_STATE, laps: [ada, best], lapCount: 2, target: target(ada) }

  assert.deepEqual(chasingFacts(compare, when), { lapTimeSeconds: 124.88, friend: 'Ada', detail: 'Ada', versusBest: '0.383 s faster than your best' })
  assert.equal(chasingFacts({ ...compare, target: target(best) }, when)?.versusBest, 'Your best')
  assert.equal(chasingFacts({ ...compare, target: null }, when), null)
})
