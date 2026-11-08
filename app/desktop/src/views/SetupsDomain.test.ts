import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NO_FILTERS, compareBlocks, comparePair, difference, drivenRows, filterSetups, groupSetups, searchSetups, sheetBlocks, toggleFilter } from './SetupsDomain'
import type { SetupDriven, SetupItem, SetupReading } from './SetupsDomain'

const reading = (group: string, label: string, display: string, step: number | null, tab: SetupReading['tab'] = 'Suspension'): SetupReading => ({
  section: group.toUpperCase(),
  key: label,
  tab,
  group,
  label,
  display,
  step,
})

test("an axle's two sides read as one value, or as both when they differ", () => {
  const blocks = sheetBlocks(
    [
      reading('Front', 'Anti-roll bar', 'P1', 1),
      reading('Front left', 'Camber', '-1.0 deg', 30),
      reading('Front right', 'Camber', '-1.0 deg', 30),
      reading('Rear left', 'Camber', '-1.0 deg', 20),
      reading('Rear right', 'Camber', '-1.2 deg', 18),
      reading('Front left', 'Slow bump', '7', 6, 'Dampers'),
    ],
    'Suspension',
  )

  assert.deepEqual(
    blocks.map((block) => [block.title, block.rows.map((row) => [row.label, row.display, row.sides])]),
    [
      ['Front', [['Anti-roll bar', 'P1', null], ['Camber', '-1.0 deg', null]]],
      ['Rear', [['Camber', '-1.0 deg · -1.2 deg', ['-1.0 deg', '-1.2 deg']]]],
    ],
  )
})

test("two setups differ where the game's steps do, whatever language each was saved in", () => {
  const english = [reading('Front left', 'Camber', '-2.0 deg', 6), reading('Front right', 'Camber', '-2.0 deg', 6), reading('Front', 'Anti-roll bar', 'P1', 1)]
  const german = [reading('Front left', 'Camber', '-2.0 Grad', 6), reading('Front right', 'Camber', '-2.0 Grad', 6), reading('Front', 'Anti-roll bar', 'P2', 2)]

  const rows = compareBlocks(english, german, 'Suspension', false).flatMap((block) => block.rows)
  assert.deepEqual(
    rows.map((row) => [row.label, row.differs, row.difference]),
    [
      ['Camber', false, null],
      ['Anti-roll bar', true, '−1 click'],
    ],
  )
  assert.equal(compareBlocks(english, german, 'Suspension', true).flatMap((block) => block.rows).length, 1)
})

test('a difference is in the values’ own unit when both are one number with it', () => {
  const row = (display: string, step: number) => ({ label: 'x', display, sides: null, steps: [step] })
  assert.equal(difference(row('-1.0 deg', 30), row('-1.2 deg', 28)), '+0.2 deg')
  assert.equal(difference(row('6.0 cm', 4), row('6.4 cm', 8)), '−0.4 cm')
  assert.equal(difference(row('51.9:48.1', 18), row('52.8:47.2', 16)), '+2 clicks')
  assert.equal(difference(row('P12', 11), row('P10', 9)), '+2 clicks')
})

const item = (id: string, car: string, trackName: string, savedAt: string, extra: Partial<SetupItem> = {}): SetupItem => ({
  id,
  name: id,
  track: trackName,
  trackName,
  car,
  carClass: 'Hypercar',
  season: null,
  savedAt,
  versions: 1,
  session: null,
  style: null,
  version: null,
  ...extra,
})

const setups = [
  item('race-v3', 'Porsche 963', 'Spa', '2026-10-30T19:12:00Z', { session: 'Race' }),
  item('quali', 'Porsche 963', 'Spa', '2026-10-28T20:05:00Z', { session: 'Quali' }),
  item('low-drag', 'Porsche 963', 'Monza', '2026-10-31T10:00:00Z'),
  item('ba-499', 'Ferrari 499P', 'Le Mans', '2026-10-05T09:00:00Z', { session: 'Race', style: 'Wet' }),
]

test('setups group by car and track, newest group first, and filter by every chip and the search', () => {
  assert.deepEqual(
    groupSetups(setups, 'newest').map((group) => [group.key.replace('\u0000', ' · '), group.setups.map((setup) => setup.id)]),
    [
      ['Porsche 963 · Monza', ['low-drag']],
      ['Porsche 963 · Spa', ['race-v3', 'quali']],
      ['Ferrari 499P · Le Mans', ['ba-499']],
    ],
  )

  const races = toggleFilter(NO_FILTERS, 'session', 'Race')
  assert.deepEqual(filterSetups(setups, races).map((setup) => setup.id), ['race-v3', 'ba-499'])
  assert.deepEqual(filterSetups(setups, toggleFilter(races, 'car', 'Porsche 963')).map((setup) => setup.id), ['race-v3'])
  assert.deepEqual(filterSetups(setups, { ...NO_FILTERS, search: 'spa porsche' }).map((setup) => setup.id), ['race-v3', 'quali'])
})

test('compare opens on a setup against the next one for the same car at the same track', () => {
  assert.deepEqual(comparePair(setups, 'race-v3'), { first: { id: 'race-v3', version: null }, second: { id: 'quali', version: null } })
  assert.deepEqual(comparePair(setups, 'ba-499')?.second, { id: 'low-drag', version: null })
  assert.equal(comparePair(setups.slice(0, 1)), null)
})

test("a run's setup list puts the session's car first even when the game names it with team and number", () => {
  const found = searchSetups(setups, '', '#6 Porsche 963 Penske')
  assert.deepEqual(found.map((setup) => setup.id), ['low-drag', 'race-v3', 'quali', 'ba-499'])
  assert.deepEqual(searchSetups(setups, 'ferrari', null).map((setup) => setup.id), ['ba-499'])
})

test('two setups compare by how they drove: times and fuel as first minus second', () => {
  const driven = (best: number | null, median: number | null, fuel: number | null, laps: number): SetupDriven => ({
    versionId: 'v',
    laps,
    sessions: 1,
    bestLapSeconds: best,
    medianLapSeconds: median,
    fuelPerLapLiters: fuel,
    tyres: laps > 0 ? [{ front: 'Soft', rear: 'Medium', laps }] : [],
  })
  assert.deepEqual(
    drivenRows(driven(125.263, 125.817, 3.11, 9), driven(126.204, 126.608, 3.05, 2)).map((row) => [row.label, row.first, row.second, row.difference]),
    [
      ['Best lap', '2:05.263', '2:06.204', '−0.941 s'],
      ['Median lap', '2:05.817', '2:06.608', '−0.791 s'],
      ['Laps', '9 laps in 1 session', '2 laps in 1 session', ''],
      ['Tyres', 'Soft front · Medium rear', 'Soft front · Medium rear', ''],
      ['Fuel per lap', '3.11 L', '3.05 L', '+0.06 L'],
    ],
  )
  assert.deepEqual(drivenRows(driven(125, 125, 3, 9), driven(null, null, null, 0))[2], { label: 'Laps', first: '9 laps in 1 session', second: '—', difference: '' })
})
