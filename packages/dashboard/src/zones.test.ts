import test from 'node:test'
import assert from 'node:assert/strict'
import { DASH_ZONES, GEAR_SPOT, dropRect, fitsZone, inFoldedSpot, zoneOf } from './zones'
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
  assert.equal(fitsZone('last_lap', DASH_ZONES.barRight), false)
  assert.equal(fitsZone('position', { col: 1, row: 0, colSpan: 2, rowSpan: 1 }), true)
  assert.equal(fitsZone('last_lap', { col: 1, row: 0, colSpan: 2, rowSpan: 1 }), false)
  assert.equal(fitsZone('bar', { col: 5, row: 4, colSpan: 1, rowSpan: 1 }), true)
})

test('a dropped widget fills a bar spot, or takes two cells pulled back inside its zone', () => {
  assert.deepEqual(dropRect('bar', 0, 5, undefined), DASH_ZONES.barLeft)
  assert.deepEqual(dropRect('bar', 4, 0, 'both'), DASH_ZONES.top)
  assert.deepEqual(dropRect('last_lap', 4, 3, undefined), { col: 3, row: 3, colSpan: 2, rowSpan: 1 })
  assert.deepEqual(dropRect('last_lap', 5, 7, undefined), { col: 5, row: 7, colSpan: 1, rowSpan: 1 })
  assert.equal(dropRect('last_lap', 5, 2, undefined), null, 'the gear')
  assert.equal(dropRect('last_lap', 10, 3, undefined), null, 'a bar spot')
})

test('nothing drops into a bar spot the page folds away, and what sits there is out of sight', () => {
  assert.equal(dropRect('bar', 0, 5, 'top'), null)
  assert.deepEqual(dropRect('bar', 4, 0, 'top'), DASH_ZONES.top)
  assert.equal(dropRect('position', 4, 0, 'sides'), null)
  assert.deepEqual(dropRect('last_lap', 1, 1, 'none'), { col: 1, row: 1, colSpan: 2, rowSpan: 1 })
  assert.equal(inFoldedSpot(DASH_ZONES.barRight, 'top'), true)
  assert.equal(inFoldedSpot(DASH_ZONES.barRight, 'sides'), false)
  assert.equal(inFoldedSpot({ col: 1, row: 0, colSpan: 2, rowSpan: 1 }, 'none'), true)
  assert.equal(inFoldedSpot({ col: 1, row: 1, colSpan: 2, rowSpan: 1 }, 'none'), false)
})

test('the zoned grid maps cells to pixels and back at any size', () => {
  assert.deepEqual(zonedRect(800, 480, { col: 5, row: 4, colSpan: 1, rowSpan: 5 }, undefined), { left: 312, top: 203, width: 176, height: 277 })
  const grid = { zoned: true, gridCols: 11, gridRows: 9 }
  assert.deepEqual(cellAt(grid, 800, 480, 320, 210, undefined), { col: 5, row: 4 })
  assert.deepEqual(cellAt(grid, 1600, 960, 10, 10, 'both'), { col: 0, row: 0 })
  assert.deepEqual(cellAt(grid, 800, 480, 799, 479, undefined), { col: 10, row: 8 })
})

test('a dropped bar spot folds away and the grids grow into it (renderer grid.rs mirrors this)', () => {
  const leftGrid = { col: 1, row: 1, colSpan: 4, rowSpan: 8 }
  assert.deepEqual(zonedRect(800, 480, leftGrid, 'top'), { left: 0, top: 36, width: 302, height: 444 })
  assert.deepEqual(zonedRect(800, 480, leftGrid, 'sides'), { left: 40, top: 0, width: 272, height: 480 })
  assert.deepEqual(zonedRect(800, 480, leftGrid, 'none'), { left: 0, top: 0, width: 302, height: 480 })
  assert.deepEqual(zonedRect(800, 480, GEAR_SPOT, 'none'), { left: 302, top: 0, width: 196, height: 180 })
  assert.equal(zonedRect(800, 480, DASH_ZONES.barLeft, 'top').width, 0)
  assert.equal(zonedRect(800, 480, DASH_ZONES.top, 'sides').height, 0)
  // The pointer never lands in a folded spot, at either edge.
  const grid = { zoned: true, gridCols: 11, gridRows: 9 }
  assert.deepEqual(cellAt(grid, 800, 480, 0, 0, 'none'), { col: 1, row: 1 })
  assert.deepEqual(cellAt(grid, 800, 480, 800, 480, 'none'), { col: 9, row: 8 })
  assert.deepEqual(cellAt(grid, 800, 480, -5, -5, 'none'), { col: 1, row: 1 }, 'before the near edge (a drag off the canvas)')
})
