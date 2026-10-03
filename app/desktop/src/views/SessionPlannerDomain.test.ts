import assert from 'node:assert/strict'
import { test } from 'node:test'
import { choicesForGame, groupPlans, nextSegment, parsePlan, planLapStats, recentLapTimes, startingRaceSkipsQualifying } from './SessionPlannerDomain'
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
