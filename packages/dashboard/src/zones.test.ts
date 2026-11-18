import test from 'node:test'
import assert from 'node:assert/strict'
import { DASH_ZONES, GEAR_SPOT, dropRect, fitsZone, zoneOf } from './zones'
import { cellAt, zonedRect } from './grid'

test('a rect is in the one zone it lies wholly in, and in none when it straddles two or covers the gear', () => {
  assert.equal(zoneOf({ col: 1, row: 1, colSpan: 4, rowSpan: 2 }), 'left')
  assert.equal(zoneOf({ col: 5, row: 6, colSpan: 1, rowSpan: 3 }), 'centre')
  assert.equal(zoneOf({ col: 4, row: 1, colSpan: 2, rowSpan: 1 }), null)
  assert.equal(zoneOf(GEAR_SPOT), null)
})

test('side bar spots take only bars, filled whole; the top takes bars and small widgets', () => {
  assert.equal(fitsZone('bar', DASH_ZONES.barLeft), true)
  assert.equal(fitsZone('bar', { col: 0, row: 0, colSpan: 1, rowSpan: 4 }), false)
  assert.equal(fitsZone('lap_time', DASH_ZONES.barRight), false)
  assert.equal(fitsZone('position', { col: 1, row: 0, colSpan: 2, rowSpan: 1 }), true)
  assert.equal(fitsZone('lap_time', { col: 1, row: 0, colSpan: 2, rowSpan: 1 }), false)
  assert.equal(fitsZone('bar', { col: 5, row: 4, colSpan: 1, rowSpan: 1 }), true)
})

test('a dropped widget fills a bar spot, or takes two cells pulled back inside its zone', () => {
  assert.deepEqual(dropRect('bar', 0, 5), DASH_ZONES.barLeft)
  assert.deepEqual(dropRect('bar', 4, 0), DASH_ZONES.top)
  assert.deepEqual(dropRect('lap_time', 4, 3), { col: 3, row: 3, colSpan: 2, rowSpan: 1 })
  assert.deepEqual(dropRect('lap_time', 5, 7), { col: 5, row: 7, colSpan: 1, rowSpan: 1 })
  assert.equal(dropRect('lap_time', 5, 2), null, 'the gear')
  assert.equal(dropRect('lap_time', 10, 3), null, 'a bar spot')
})

test('the zoned grid maps cells to pixels and back at any size', () => {
  assert.deepEqual(zonedRect(800, 480, { col: 5, row: 4, colSpan: 1, rowSpan: 5 }), { left: 312, top: 203, width: 176, height: 277 })
  const grid = { zoned: true, gridCols: 11, gridRows: 9 }
  assert.deepEqual(cellAt(grid, 800, 480, 320, 210), { col: 5, row: 4 })
  assert.deepEqual(cellAt(grid, 1600, 960, 10, 10), { col: 0, row: 0 })
  assert.deepEqual(cellAt(grid, 800, 480, 799, 479), { col: 10, row: 8 })
})
