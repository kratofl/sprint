import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildPlanSetTarget,
  choicesForGame,
  groupPlans,
  nextSegment,
  parsePlan,
  planLapStats,
  practiceSummary,
  raceFuelLiters,
  raceLaps,
  recentLapTimes,
  sessionState,
  startingRaceSkipsQualifying,
  weekendTimeline,
} from './SessionPlannerDomain'
import type { PlanTargetOption } from '../bridge'
import type { SessionPlan } from './SessionPlannerDomain'

function plan(overrides: Record<string, unknown> = {}): SessionPlan {
  const parsed = parsePlan({ id: 'plan-1', ...overrides })
  assert.ok(parsed)
  return parsed
}

const lap = (lapNumber: number, lapTimeSeconds: number, isValid = true) => ({ lapNumber, lapTimeSeconds, isValid })
const segment = (kind: 'Qualifying' | 'Race', laps: ReturnType<typeof lap>[] = []) => ({ id: `${kind}-seg`, kind, actualStart: '2026-10-01T18:00:00Z', laps })

test('the next step is qualifying until one has run, when the plan includes it', () => {
  const fresh = plan({ qualifyingIncluded: true })
  assert.equal(nextSegment(fresh), 'Qualifying')
  assert.equal(startingRaceSkipsQualifying(fresh), true)

  const qualified = plan({ qualifyingIncluded: true, segments: [segment('Qualifying')] })
  assert.equal(nextSegment(qualified), 'Race')
  assert.equal(startingRaceSkipsQualifying(qualified), false)
})

test('a plan without qualifying goes straight to the race, with no skip to confirm', () => {
  const raceOnly = plan({ qualifyingIncluded: false })
  assert.equal(nextSegment(raceOnly), 'Race')
  assert.equal(startingRaceSkipsQualifying(raceOnly), false)
})

test('plans split into open and finished, keeping their order', () => {
  const plans = [
    plan({ id: 'a', status: 'Completed' }),
    plan({ id: 'b', status: 'Armed' }),
    plan({ id: 'c', status: 'Abandoned' }),
    plan({ id: 'd', status: 'Draft' }),
  ]
  const { open, finished } = groupPlans(plans)
  assert.deepEqual(open.map((item) => item.id), ['b', 'd'])
  assert.deepEqual(finished.map((item) => item.id), ['a', 'c'])
})

test('the thumbnail strip holds the last valid laps, oldest first', () => {
  const recorded = plan({
    segments: [segment('Qualifying', [lap(1, 125), lap(2, 300, false), lap(3, 124)]), segment('Race', [lap(1, 126), lap(2, 127)])],
  })
  assert.deepEqual(recentLapTimes(recorded), [125, 124, 126, 127])
  assert.deepEqual(recentLapTimes(recorded, 2), [126, 127])
})

test('lap stats count every lap but take the best from valid laps only', () => {
  const recorded = plan({ segments: [segment('Race', [lap(1, 110, false), lap(2, 125), lap(3, 124.5)])] })
  assert.deepEqual(planLapStats(recorded), { laps: 3, bestLapSeconds: 124.5 })
  assert.deepEqual(planLapStats(plan()), { laps: 0, bestLapSeconds: null })
})

test('a recorded game offers only its own tracks and cars; anything else offers everything', () => {
  const choices = {
    prefill: { game: '', car: '', track: '' },
    games: ['iRacing', 'Le Mans Ultimate'],
    tracks: ['Monza', 'Road Atlanta'],
    cars: ['Mazda MX-5', 'Porsche 963'],
    byGame: [
      { game: 'Le Mans Ultimate', tracks: ['Monza'], cars: ['Porsche 963'] },
      { game: 'iRacing', tracks: ['Road Atlanta'], cars: ['Mazda MX-5'] },
    ],
  }
  assert.deepEqual(choicesForGame(choices, ' le mans ultimate '), { tracks: ['Monza'], cars: ['Porsche 963'] })
  assert.deepEqual(choicesForGame(choices, 'Automobilista 2'), { tracks: choices.tracks, cars: choices.cars })
  assert.deepEqual(choicesForGame(choices, ''), { tracks: choices.tracks, cars: choices.cars })
})

test('the timeline sits on the next session, on the live one while tracking, and at the finish when done', () => {
  assert.deepEqual(weekendTimeline(plan({ qualifyingIncluded: true, status: 'Armed' })), { stops: ['Practice', 'Qualifying', 'Race', 'Finish'], at: 1 })
  const live = plan({ status: 'Tracking', segments: [{ ...segment('Qualifying'), actualEnd: '2026-10-01T18:20:00Z' }, segment('Race')] })
  assert.equal(weekendTimeline(live).at, 2)
  assert.equal(sessionState(live, 'Qualifying'), 'done')
  assert.equal(sessionState(live, 'Race'), 'live')
  assert.deepEqual(weekendTimeline(plan({ qualifyingIncluded: false, status: 'Completed' })), { stops: ['Practice', 'Race', 'Finish'], at: 2 })
  assert.equal(sessionState(plan({ qualifyingIncluded: false }), 'Qualifying'), 'skipped')
  assert.equal(sessionState(plan({ qualifyingIncluded: true }), 'Race'), 'later')
})

test('race laps come from minutes over the average lap, and fuel adds the reserve', () => {
  const sixHours = plan({ raceLengthFormat: 'TimeBased', raceLengthValue: 360, avgLapTimeSeconds: 125.6, fuelPerLapLiters: 3.5, fuelReserveLaps: 1 })
  assert.equal(raceLaps(sixHours), 172)
  assert.equal(raceFuelLiters(sixHours), 173 * 3.5)
  assert.equal(raceLaps(plan({ raceLengthFormat: 'TimeBased', raceLengthValue: 360 })), null)
  assert.equal(raceLaps(plan({ raceLengthFormat: 'LapBased', raceLengthValue: 30 })), 30)
})

const option = (statistic: PlanTargetOption['statistic'], lapTimeSeconds: number, startedAt: string, lapNumber: number): PlanTargetOption => ({
  scope: 'Practice',
  programType: null,
  statistic,
  lapTimeSeconds,
  sampleSize: 3,
  lapSessionId: `s-${startedAt}`,
  lapNumber,
  lapSessionStartedAt: startedAt,
  tierNote: 'time only',
})

test('practice reads best and median from the statistics and lists laps oldest first', () => {
  const laps = [option('Custom', 124.9, '2026-11-12', 6), option('Custom', 125.4, '2026-11-10', 2), option('Custom', 127.2, '2026-11-12', 1)]
  const summary = practiceSummary([
    { scope: 'Practice', programType: null, label: 'Practice', sampleSize: 3, options: [option('Fastest', 124.9, '2026-11-12', 6), option('Median', 125.4, '2026-11-10', 2)], laps },
  ])
  assert.deepEqual(summary, { laps: 3, best: 124.9, median: 125.4, times: [125.4, 127.2, 124.9] })
  assert.equal(practiceSummary([]), null)
})

test('a specific-lap target names its lap; a statistic does not', () => {
  assert.deepEqual(buildPlanSetTarget('p', 'Race', option('Median', 125.4, 'x', 2)), { type: 'plan.setTarget', planId: 'p', kind: 'Race', scope: 'Practice', statistic: 'Median' })
  assert.deepEqual(buildPlanSetTarget('p', 'Race', option('Custom', 125.4, 'x', 2)), {
    type: 'plan.setTarget',
    planId: 'p',
    kind: 'Race',
    scope: 'Practice',
    statistic: 'Custom',
    lapSessionId: 's-x',
    lapNumber: 2,
  })
})
