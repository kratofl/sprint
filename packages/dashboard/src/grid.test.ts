import test from 'node:test'
import assert from 'node:assert/strict'
import { gridRect } from './grid'
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
