import test from 'node:test'
import assert from 'node:assert/strict'
import type { SessionSummary, SetupSummary } from './gql/generated'
import { isActive } from './navigation.ts'
import { formatMonth, shiftMonth } from './period.ts'
import { matchesQuery } from './search.ts'
import { overviewKpis, sessionsPerWeek } from './overview.ts'

test('sidebar root entry only matches the root path', () => {
  assert.equal(isActive('/', '/'), true)
  assert.equal(isActive('/sessions', '/'), false)
})

test('sidebar entries match nested paths on a segment boundary only', () => {
  assert.equal(isActive('/sessions', '/sessions'), true)
  assert.equal(isActive('/sessions/abc', '/sessions'), true)
  assert.equal(isActive('/dashboard', '/dash'), false)
})

test('month stepper rolls over year boundaries in both directions', () => {
  assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 })
  assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 })
  assert.equal(formatMonth({ year: 2026, month: 8 }), 'September 2026')
})

test('search ignores queries shorter than two characters', () => {
  assert.equal(matchesQuery(['Spa', 'Porsche 963'], 'z'), true)
  assert.equal(matchesQuery(['Spa', 'Porsche 963'], 'zz'), false)
  assert.equal(matchesQuery(['Spa', 'Porsche 963'], ' porSCHE '), true)
})

const session = (id: string, createdAt: string, track: string, car: string): SessionSummary => ({
  id, createdAt, track, car, game: 'LMU', ownerId: 'me', sessionType: 'Practice',
})

test('overview KPIs stay empty until something is synced', () => {
  const kpis = overviewKpis([], [], { year: 2026, month: 8 })
  assert.deepEqual(kpis.map((kpi) => kpi.kind), ['empty', 'empty', 'empty', 'empty'])
})

test('overview KPIs count the selected month only', () => {
  const sessions = [
    session('a', '2026-09-03T10:00:00Z', 'Spa', 'Porsche 963'),
    session('b', '2026-09-20T10:00:00Z', 'Spa', 'Ferrari 499P'),
    session('c', '2026-08-30T10:00:00Z', 'Monza', 'Porsche 963'),
  ]
  const setups: SetupSummary[] = []
  const kpis = overviewKpis(sessions, setups, { year: 2026, month: 8 })
  assert.deepEqual(
    kpis.map((kpi) => (kpi.kind === 'value' ? kpi.value : null)),
    ['2', '1', '2', null],
  )
})

test('session chart buckets a month into 7-day slices', () => {
  const sessions = [
    session('a', '2026-09-07T23:00:00Z', 'Spa', 'Porsche 963'),
    session('b', '2026-09-08T01:00:00Z', 'Spa', 'Porsche 963'),
    session('c', '2026-09-30T10:00:00Z', 'Spa', 'Porsche 963'),
  ]
  assert.deepEqual(sessionsPerWeek(sessions, { year: 2026, month: 8 }), [
    { label: '1–7', count: 1 },
    { label: '8–14', count: 1 },
    { label: '15–21', count: 0 },
    { label: '22–28', count: 0 },
    { label: '29–30', count: 1 },
  ])
})
