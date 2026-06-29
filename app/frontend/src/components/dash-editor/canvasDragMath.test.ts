import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveResizeGeom, resolveMoveGeom } from './canvasDragMath.ts'

const GRID_COLS = 20
const GRID_ROWS = 12

test('resolveResizeGeom: south-east handle grows span from the rounded pointer', () => {
  const start = { col: 2, row: 2, colSpan: 3, rowSpan: 2 }
  const geom = resolveResizeGeom(start, 'se', 9.6, 7.6, GRID_COLS, GRID_ROWS)
  assert.deepEqual(geom, { col: 2, row: 2, colSpan: 8, rowSpan: 6 })
})

test('resolveResizeGeom: east handle keeps a minimum span of 1', () => {
  const start = { col: 2, row: 2, colSpan: 3, rowSpan: 2 }
  const geom = resolveResizeGeom(start, 'e', 2, 2, GRID_COLS, GRID_ROWS)
  assert.equal(geom.colSpan, 1)
  assert.equal(geom.col, 2)
})

test('resolveResizeGeom: west handle moves the left edge and never crosses the right edge', () => {
  const start = { col: 5, row: 2, colSpan: 4, rowSpan: 2 } // right edge at col 9
  const grow = resolveResizeGeom(start, 'w', 3, 2, GRID_COLS, GRID_ROWS)
  assert.deepEqual(grow, { col: 3, row: 2, colSpan: 6, rowSpan: 2 })
  const clamped = resolveResizeGeom(start, 'w', 50, 2, GRID_COLS, GRID_ROWS)
  assert.deepEqual(clamped, { col: 8, row: 2, colSpan: 1, rowSpan: 2 })
})

test('resolveResizeGeom: north-west corner adjusts both axes', () => {
  const start = { col: 5, row: 5, colSpan: 4, rowSpan: 4 } // right 9, bottom 9
  const geom = resolveResizeGeom(start, 'nw', 3, 3, GRID_COLS, GRID_ROWS)
  assert.deepEqual(geom, { col: 3, row: 3, colSpan: 6, rowSpan: 6 })
})

test('resolveResizeGeom: span is clamped to the grid bounds', () => {
  const start = { col: 0, row: 0, colSpan: 2, rowSpan: 2 }
  const geom = resolveResizeGeom(start, 'se', 100, 100, GRID_COLS, GRID_ROWS)
  assert.deepEqual(geom, { col: 0, row: 0, colSpan: GRID_COLS, rowSpan: GRID_ROWS })
})

test('resolveMoveGeom: snaps the rounded top-left and preserves span', () => {
  const start = { col: 2, row: 2, colSpan: 3, rowSpan: 2 }
  const geom = resolveMoveGeom(start, 0.5, 0.5, 5.4, 4.6, GRID_COLS, GRID_ROWS)
  assert.deepEqual(geom, { col: 5, row: 4, colSpan: 3, rowSpan: 2 })
})

test('resolveMoveGeom: clamps to the top-left grid corner', () => {
  const start = { col: 2, row: 2, colSpan: 3, rowSpan: 2 }
  const geom = resolveMoveGeom(start, 5, 5, 0, 0, GRID_COLS, GRID_ROWS)
  assert.deepEqual(geom, { col: 0, row: 0, colSpan: 3, rowSpan: 2 })
})

test('resolveMoveGeom: clamps so the rect stays fully inside the grid', () => {
  const start = { col: 2, row: 2, colSpan: 3, rowSpan: 2 }
  const geom = resolveMoveGeom(start, 0, 0, 100, 100, GRID_COLS, GRID_ROWS)
  assert.deepEqual(geom, { col: GRID_COLS - 3, row: GRID_ROWS - 2, colSpan: 3, rowSpan: 2 })
})
