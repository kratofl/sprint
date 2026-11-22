import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashLayout } from '@sprint/dashboard'
import { emptyCells, evenTracks, lineShare, moveGridLine, movePage, resetLapReview, setLapReviewCell, trackPercent } from './layoutOps'

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

const tracked: DashLayout = { ...layout, gridCols: 10, gridRows: 9, colSizes: [40, 90, 90, 90, 90, 90, 90, 90, 90, 40], rowSizes: [36, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5] }

test('the free cells are every cell no widget takes', () => {
  assert.equal(emptyCells(layout, layout.pages[0]).length, 20 * 12 - 12)
  assert.equal(emptyCells(tracked, { id: 'z', name: 'Z', widgets: [{ id: 'gear', type: 'gear', col: 4, row: 1, colSpan: 2, rowSpan: 3 }] }).length, 90 - 6)
})

test('a grid line moves only the two tracks either side and never squeezes one below its smallest share', () => {
  const moved = moveGridLine(tracked, 'cols', 1, 0.1)
  assert.deepEqual(moved?.colSizes?.slice(0, 3), [80, 50, 90], 'a tenth of 800 is the first column; the second gives it up')
  assert.equal(moved?.colSizes?.reduce((sum, size) => sum + size, 0), 800)
  assert.deepEqual(moved?.rowSizes, tracked.rowSizes)
  assert.equal(moveGridLine(tracked, 'cols', 1, 0.05), null, 'already there: no undo step')
  assert.deepEqual(moveGridLine(tracked, 'rows', 1, -1)?.rowSizes?.slice(0, 2), [9.6, 81.9], 'pulled past the edge: the smallest share, 2 % of 480')
  assert.equal(moveGridLine(tracked, 'cols', 0, 0.5), null, 'the canvas edge is no line')
  assert.equal(moveGridLine(layout, 'cols', 1, 0.5), null, 'an older, even-grid dash has no tracks to move')
  assert.equal(lineShare(tracked, 'cols', 1), 0.05)
  assert.equal(trackPercent(tracked, 'rows', 0), '8 %')
})

test('columns and rows even out on their own, once', () => {
  const even = evenTracks(tracked, 'cols')
  assert.deepEqual(even?.colSizes, Array.from({ length: 10 }, () => 80))
  assert.equal(even && evenTracks(even, 'cols'), null)
  assert.deepEqual(even?.rowSizes, tracked.rowSizes)
})
