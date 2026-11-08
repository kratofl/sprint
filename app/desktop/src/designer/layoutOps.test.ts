import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashLayout } from '@sprint/dashboard'
import { movePage } from './layoutOps'

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

test('pages move one place at a time and stop at the ends', () => {
  assert.deepEqual(movePage(layout, 'b', -1)?.pages.map((page) => page.id), ['b', 'a', 'c'])
  assert.deepEqual(movePage(layout, 'b', 1)?.pages.map((page) => page.id), ['a', 'c', 'b'])
  assert.equal(movePage(layout, 'a', -1), null)
  assert.equal(movePage(layout, 'c', 1), null)
  assert.equal(movePage(layout, 'idle', 1), null)
})
