import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildPlanSetTarget,
  choicesForGame,
  derivedPlanName,
  detectedRaceFormat,
  figureSource,
  groupPlans,
  nextSegment,
  parsePlan,
  planLapStats,
  positiveOrNull,
  practiceSummary,
  quickPlanInput,
  readPlannerSettings,
  recentLapTimes,
  reserveNote,
  sessionState,
  startingRaceSkipsQualifying,
  stintsLabel,
  weekendTimeline,
} from './SessionPlannerDomain'
import type { QuickPlanAnswers } from './SessionPlannerDomain'
import type { PlanDetection, PlanTargetOption } from '../bridge'
import type { SessionPlan } from './SessionPlannerDomain'

function plan(overrides: Record<string, unknown> = {}): SessionPlan {
  const parsed = parsePlan({ id: 'plan-1', ...overrides })
  assert.ok(parsed)
  return parsed
}

const lap = (lapNumber: number, lapTimeSeconds: number, isValid = true) => ({ lapNumber, lapTimeSeconds, isValid })
const segment = (kind: 'Qualifying' | 'Race', laps: ReturnType<typeof lap>[] = []) => ({ id: `${kind}-seg`, kind, actualStart: '2026-10-01T18:00:00Z', laps })

test('a typed figure of 0 or nothing is no figure, and any decimals stand', () => {
  // Plans stored 0 for "not typed"; the host refuses 0, so the dialog never sends it.
  assert.equal(positiveOrNull(''), null)
  assert.equal(positiveOrNull('0'), null)
  assert.equal(positiveOrNull('-1'), null)
  assert.equal(positiveOrNull('3.52'), 3.52)
})

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

test('an unnamed plan is called after its track and car, as the host names it', () => {
  assert.equal(derivedPlanName('Spa-Francorchamps', 'Porsche 963'), 'Spa-Francorchamps – Porsche 963')
  assert.equal(derivedPlanName(' Spa ', ''), 'Spa')
  assert.equal(derivedPlanName('', 'Porsche 963'), 'Porsche 963')
  assert.equal(derivedPlanName('  ', ''), 'New Session Plan')
})

const detection = (overrides: Partial<PlanDetection> = {}): PlanDetection => ({
  context: { game: 'Le Mans Ultimate', car: 'Hypercar Porsche', track: 'Spa' },
  raceLength: { format: 'TimeBased', value: 60 },
  hasFuelHistory: true,
  missing: [],
  ...overrides,
})

const answers: QuickPlanAnswers = { game: 'Typed game', car: 'Typed car', track: 'Typed track', raceLengthFormat: 'LapBased', raceLength: '24' }

test('a quick plan takes what was detected and only the answers it asked for', () => {
  const everything = quickPlanInput(detection(), answers, 2)
  assert.deepEqual(
    [everything.name, everything.mode, everything.game, everything.car, everything.track, everything.raceLengthFormat, everything.raceLengthValue, everything.fuelReserveLaps, everything.avgLapTimeSeconds, everything.fuelPerLapLiters],
    ['', 'Quick', 'Le Mans Ultimate', 'Hypercar Porsche', 'Spa', 'TimeBased', 60, 2, null, null],
  )

  const gaps = quickPlanInput(detection({ raceLength: null, hasFuelHistory: false, missing: ['Context', 'RaceLength', 'Fuel'] }), answers, 1)
  // No laps here: still no typed fuel figures; the estimate fills in from the first laps driven.
  assert.deepEqual(
    [gaps.game, gaps.car, gaps.track, gaps.raceLengthFormat, gaps.raceLengthValue, gaps.avgLapTimeSeconds, gaps.fuelPerLapLiters],
    ['Typed game', 'Typed car', 'Typed track', 'LapBased', 24, null, null],
  )

  // A length left blank stays unset rather than becoming a zero-lap race.
  const blank = quickPlanInput(detection({ raceLength: null, missing: ['RaceLength'] }), { ...answers, raceLength: '' }, 1)
  assert.equal(blank.raceLengthFormat, 'Unknown')
})

test('planner settings fall back to the host defaults', () => {
  assert.deepEqual(readPlannerSettings({}), { fuelReserveLaps: 1, fuelHistorySource: 'AllValidLaps', warnOnRaceFormatMismatch: true })
  assert.deepEqual(
    readPlannerSettings({ sessionPlanner: { fuelReserveLaps: 3, fuelHistorySource: 'MatchingSessionType', warnOnRaceFormatMismatch: false } }),
    { fuelReserveLaps: 3, fuelHistorySource: 'MatchingSessionType', warnOnRaceFormatMismatch: false },
  )
  assert.equal(readPlannerSettings({ sessionPlanner: { fuelReserveLaps: -2 } }).fuelReserveLaps, 1)
})

test('stints read as runs of whole litres', () => {
  assert.equal(stintsLabel([88, 88, 88, 80.2]), '3 × 88 L, then 81 L')
  assert.equal(stintsLabel([48, 48]), '2 × 48 L')
  assert.equal(stintsLabel([72.5]), '73 L')
  assert.equal(figureSource({ source: 'History', value: 3.4, laps: 1 }), 'median of 1 lap')
  assert.equal(figureSource({ source: 'Plan', value: 3.4 }), 'from the plan')
  assert.deepEqual([0, 1, 2].map(reserveNote), ['no reserve', '+1 lap reserve', '+2 laps reserve'])
})

test('the race format the game reported comes from the race segment', () => {
  assert.equal(detectedRaceFormat(plan()), null)
  assert.equal(detectedRaceFormat(plan({ segments: [{ ...segment('Race'), detectedRaceFormat: 'LapBased' }] })), 'LapBased')
  assert.equal(detectedRaceFormat(plan({ segments: [{ ...segment('Race'), detectedRaceFormat: 'Unknown' }] })), null)
})
