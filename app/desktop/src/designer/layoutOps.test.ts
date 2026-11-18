import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashLayout } from '@sprint/dashboard'
import { emptyCells, movePage, resetLapReview, setLapReviewCell } from './layoutOps'

const layout: DashLayout = {
  id: 'dash',
  name: 'Dash',
  mode: 'basic',
  gridCols: 20,
  gridRows: 12,
  pages: [
    { id: 'a', name: 'A', widgets: [{ id: 'tc', type: 'tc', col: 0, row: 0, colSpan: 3, rowSpan: 2 }, { id: 'abs', type: 'abs', col: 3, row: 0, colSpan: 3, rowSpan: 2 }] },
    { id: 'b', name: 'B', widgets: [] },
    { id: 'c', name: 'C', widgets: [] },
  ],
  alerts: [],
}

test('a lap review box takes a field, keeps the others at their defaults, and resets to none of its own', () => {
  const picked = setLapReviewCell(layout, 3, 'energy_used')
  assert.deepEqual(picked?.lapReview?.cells, ['sector1', 'sector2', 'sector3', 'energy_used', 'fuel_used', 'target'])
  assert.equal(picked && setLapReviewCell(picked, 3, 'energy_used'), null, 'already there: no edit, no undo step')
  assert.equal(setLapReviewCell(layout, 6, 'lap'), null)
  assert.equal(picked && resetLapReview(picked)?.lapReview, undefined)
  assert.equal(resetLapReview(layout), null)
})

test('pages move one place at a time and stop at the ends', () => {
  assert.deepEqual(movePage(layout, 'b', -1)?.pages.map((page) => page.id), ['b', 'a', 'c'])
  assert.deepEqual(movePage(layout, 'b', 1)?.pages.map((page) => page.id), ['a', 'c', 'b'])
  assert.equal(movePage(layout, 'a', -1), null)
  assert.equal(movePage(layout, 'c', 1), null)
  assert.equal(movePage(layout, 'idle', 1), null)
})

test('the free places of a zoned page are its empty side bar spots whole and its other empty cells one by one', () => {
  const zoned: DashLayout = { ...layout, zoned: true, gridCols: 11, gridRows: 9 }
  const page = { id: 'z', name: 'Z', widgets: [{ id: 'tc', type: 'tc', col: 1, row: 1, colSpan: 2, rowSpan: 1 }, { id: 'bar', type: 'bar', col: 0, row: 0, colSpan: 1, rowSpan: 9 }] }
  const free = emptyCells(zoned, page)
  // The right bar spot, then the top's 9, the side grids' 2 x 32 and the centre's 5, less TC's 2.
  assert.equal(free.length, 1 + 9 + 64 + 5 - 2)
  assert.deepEqual(free[0], { col: 10, row: 0, colSpan: 1, rowSpan: 9 })
  assert.ok(!free.some((cell) => cell.col === 5 && cell.row >= 1 && cell.row <= 3), 'the gear is no free place')
  assert.equal(emptyCells(layout, layout.pages[0]).length, 20 * 12 - 12, 'a free grid counts every cell')
})
