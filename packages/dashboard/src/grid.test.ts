import test from 'node:test'
import assert from 'node:assert/strict'
import { cellAt, gridLines, gridRect, layoutRect } from './grid'
import type { DashWidget } from './index'

function widget(overrides: Partial<DashWidget> = {}): DashWidget {
  return { id: 'w1', type: 'text', col: 0, row: 0, colSpan: 1, rowSpan: 1, ...overrides }
}

test('gridRect divides the canvas evenly for a widget spanning the whole grid', () => {
  const rect = gridRect(800, 480, 20, 12, widget({ col: 0, row: 0, colSpan: 20, rowSpan: 12 }))
  assert.deepEqual(rect, { left: 0, top: 0, width: 800, height: 480 })
})

test('gridRect places a widget at its column/row offset with the expected size', () => {
  // 20 cols over 800px = 40px/col; widget at col 5, spanning 4 cols -> [200, 360).
  const rect = gridRect(800, 480, 20, 12, widget({ col: 5, row: 0, colSpan: 4, rowSpan: 1 }))
  assert.equal(rect.left, 200)
  assert.equal(rect.width, 160)
})

test('gridRect never emits a negative or inverted span, even for a zero-span widget', () => {
  const rect = gridRect(800, 480, 20, 12, widget({ col: 19, row: 11, colSpan: 0, rowSpan: 0 }))
  assert.ok(rect.width >= 1)
  assert.ok(rect.height >= 1)
  assert.ok(rect.left + rect.width <= 800)
  assert.ok(rect.top + rect.height <= 480)
})

/** The default look's tracks at 800x480: narrow first and last columns, a short top row. */
const tracked = { gridCols: 10, gridRows: 9, colSizes: [40, 90, 90, 90, 90, 90, 90, 90, 90, 40], rowSizes: [36, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5] }

test('a dash keeps its track shares at any size (renderer grid.rs mirrors this)', () => {
  assert.deepEqual(layoutRect(tracked, 800, 480, { col: 4, row: 1, colSpan: 2, rowSpan: 3 }), { left: 310, top: 36, width: 180, height: 167 })
  assert.deepEqual(layoutRect(tracked, 800, 480, { col: 0, row: 0, colSpan: 10, rowSpan: 9 }), { left: 0, top: 0, width: 800, height: 480 })
  assert.deepEqual(layoutRect(tracked, 1600, 960, { col: 1, row: 1, colSpan: 3, rowSpan: 8 }), { left: 80, top: 72, width: 540, height: 888 })
})

test('the cell under the pointer follows the tracks and stays inside the grid', () => {
  assert.deepEqual(cellAt(tracked, 800, 480, 39, 35), { col: 0, row: 0 })
  assert.deepEqual(cellAt(tracked, 800, 480, 40, 36), { col: 1, row: 1 })
  assert.deepEqual(cellAt(tracked, 800, 480, -5, 900), { col: 0, row: 8 }, 'off the canvas: the nearest cell')
  assert.deepEqual(cellAt({ gridCols: 20, gridRows: 12 }, 800, 480, 799, 0), { col: 19, row: 0 }, 'an older dash: the even grid')
  assert.deepEqual(gridLines(tracked, 800, 480).cols.slice(0, 3), [0, 40, 130])
})
