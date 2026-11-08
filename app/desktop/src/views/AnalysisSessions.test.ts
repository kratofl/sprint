import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CorpusSession } from './AnalysisDomain'
import {
  NO_SESSION_FILTERS,
  filterSessions,
  gapToYourBest,
  groupLine,
  groupSessions,
  groupShared,
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

test('sessions group by car and track, newest group first, with your best there and not a friend’s', () => {
  const groups = groupSessions(SESSIONS)
  assert.deepEqual(
    groups.map((group) => [group.track, group.sessions.map((entry) => entry.id), group.yourBestSeconds]),
    [
      ['Spa', ['spa-quali', 'spa-practice', 'ada'], 124.981],
      ['Monza', ['monza'], 98.4],
    ],
  )
  assert.equal(groupLine(groups[0]), '2 sessions · 1 shared lap')
  assert.equal(groupLine({ ...groups[0], car: 'LMP2 ELMS', carType: 'Oreca 07' }), 'Oreca 07 · 2 sessions · 1 shared lap')
})

test('each session says how far its best was off your best there; a faster friend is ahead of it', () => {
  const spa = groupSessions(SESSIONS)[0]
  assert.deepEqual(
    spa.sessions.map((entry) => gapToYourBest(entry, spa)),
    [0, 0.659, -0.101],
  )
})

test('filters narrow by every chip at once, and the search by car, track or who shared it', () => {
  const quali = toggleSessionFilter(toggleSessionFilter(NO_SESSION_FILTERS, 'track', 'Spa'), 'kind', 'Quali')
  assert.deepEqual(filterSessions(SESSIONS, quali).map((entry) => entry.id), ['spa-quali'])
  assert.deepEqual(filterSessions(SESSIONS, { ...NO_SESSION_FILTERS, search: 'ada' }).map((entry) => entry.id), ['ada'])
  assert.deepEqual(filterSessions(SESSIONS, toggleSessionFilter(quali, 'kind', 'Quali')).map((entry) => entry.id), ['spa-quali', 'spa-practice', 'ada'])
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
