import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CorpusSession } from './AnalysisDomain'
import {
  NO_SESSION_FILTERS,
  filterSessions,
  groupShared,
  sessionFilterChoices,
  sessionLine,
  sessionsIn,
  sharedStanding,
  toggleSessionFilter,
} from './AnalysisSessions'

function session(id: string, startedAt: string, car: string, track: string, best: number, extra: Partial<CorpusSession> = {}): CorpusSession {
  return {
    id,
    context: { game: 'LMU', trackCourse: track, carModel: car, carType: null, livery: null, trackLengthMeters: null, carClass: 'Hypercar' },
    kind: 'Practice',
    origin: 'Recorded',
    startedAt,
    lapCount: 9,
    tracedLapCount: 9,
    bestLapSeconds: best,
    sharedFrom: null,
    day: null,
    label: 'Practice',
    detail: '',
    hasChannels: true,
    runs: 3,
    ...extra,
  }
}

const SESSIONS = [
  session('spa-quali', '2026-11-07T21:10:00Z', 'Porsche 963', 'Spa', 124.981, { kind: 'Qualifying', runs: 1, lapCount: 4 }),
  session('monza', '2026-11-06T18:00:00Z', 'Porsche 963', 'Monza', 98.4),
  session('spa-practice', '2026-11-05T18:40:00Z', 'Porsche 963', 'Spa', 125.64),
  session('ada', '2026-10-30T12:00:00Z', 'Porsche 963', 'Spa', 124.88, { sharedFrom: 'Ada Brandt', origin: 'Shared', runs: 0, lapCount: 1 }),
]

test('filters narrow by every chip at once, and the search by car, track or who shared it', () => {
  const quali = toggleSessionFilter(toggleSessionFilter(NO_SESSION_FILTERS, 'track', 'Spa'), 'kind', 'Quali')
  assert.deepEqual(filterSessions(SESSIONS, quali).map((entry) => entry.id), ['spa-quali'])
  assert.deepEqual(filterSessions(SESSIONS, { ...NO_SESSION_FILTERS, search: 'ada' }).map((entry) => entry.id), ['ada'])
  assert.deepEqual(filterSessions(SESSIONS, toggleSessionFilter(quali, 'kind', 'Quali')).map((entry) => entry.id), ['spa-quali', 'spa-practice', 'ada'])
})

test('a chip offers only what fits the other chips, and keeps what is already chosen', () => {
  const gt3 = (id: string, car: string) => session(id, '2026-11-01T10:00:00Z', car, 'Spa', 138, { context: { ...SESSIONS[0].context, carModel: car, carClass: 'GT3' } })
  const sessions = [...SESSIONS, gt3('bmw', 'BMW M4 GT3'), gt3('ferrari', 'Ferrari 296 GT3')]
  const cars = (filters: typeof NO_SESSION_FILTERS) => sessionFilterChoices(sessions, 'car', filters).map((choice) => `${choice.value} ${choice.count}`)
  assert.deepEqual(cars(NO_SESSION_FILTERS), ['BMW M4 GT3 1', 'Ferrari 296 GT3 1', 'Porsche 963 4'])
  const classGt3 = toggleSessionFilter(NO_SESSION_FILTERS, 'carClass', 'GT3')
  assert.deepEqual(cars(classGt3), ['BMW M4 GT3 1', 'Ferrari 296 GT3 1'])
  assert.deepEqual(cars(toggleSessionFilter(classGt3, 'car', 'Porsche 963')), ['BMW M4 GT3 1', 'Ferrari 296 GT3 1', 'Porsche 963 0'])
})

test('a session says its runs when it knows them', () => {
  assert.equal(sessionLine(SESSIONS[0]), '1 run · 4 laps')
  assert.equal(sessionLine({ ...SESSIONS[2], runs: 0, lapCount: 28 }), '28 laps')
  assert.equal(sessionLine(SESSIONS[3]), 'Shared with you')
})

test('your sessions and shared laps never share a list', () => {
  assert.deepEqual(sessionsIn(SESSIONS, 'mine').map((entry) => entry.id), ['spa-quali', 'monza', 'spa-practice'])
  assert.deepEqual(sessionsIn(SESSIONS, 'shared').map((entry) => entry.id), ['ada'])
})

test('shared laps sit under who sent them, and say how they stand against your best there', () => {
  const jonas = session('jonas', '2026-11-01T12:00:00Z', 'Porsche 963', 'Le Mans', 210.5, { sharedFrom: 'Jonas Weber', origin: 'Shared' })
  const people = groupShared([...SESSIONS, jonas])
  assert.deepEqual(people.map((person) => [person.name, person.sessions.map((entry) => entry.id)]), [
    ['Jonas Weber', ['jonas']],
    ['Ada Brandt', ['ada']],
  ])
  assert.equal(sharedStanding(SESSIONS[3], SESSIONS), '0.101 s faster than you')
  assert.equal(sharedStanding(jonas, SESSIONS), 'You haven’t driven it')
})
