import assert from 'node:assert/strict'
import { test } from 'node:test'
import { onScreen, pitWallQuery, readPitWallTarget, readPitWallWindows, readTraceLap } from './pitWallRoute.js'

test('the renderer opens the wall, or brings a page or tile window forward', () => {
  assert.deepEqual(readPitWallTarget(undefined), { kind: 'main' })
  assert.deepEqual(readPitWallTarget({ kind: 'page', id: 'car' }), { kind: 'page', id: 'car' })
  for (const value of [42, { kind: 'page' }, { kind: 'window', id: 'x' }, { kind: 'tile', id: 'x'.repeat(201) }]) {
    assert.throws(() => readPitWallTarget(value))
  }
  assert.equal(readTraceLap('best'), 'best')
  assert.throws(() => readTraceLap('fastest'))
  assert.equal(pitWallQuery({ kind: 'tile', id: 't1' }), 'tile:t1')
})

test('detached pages and tiles come from the layout, and a state without one closes nothing', () => {
  const state = {
    pitWallLayout: {
      mainBounds: { x: 0, y: 0, width: 1600, height: 900 },
      pages: [
        { id: 'race', detached: false, tiles: [{ id: 'traces', detached: true, bounds: null }, { id: 'map', detached: false }] },
        { id: 'car', detached: true, bounds: { x: 1920, y: 0, width: 1600, height: 900 }, tiles: [] },
      ],
    },
  }
  assert.deepEqual(readPitWallWindows(state), {
    mainBounds: { x: 0, y: 0, width: 1600, height: 900 },
    detached: [
      { kind: 'tile', id: 'traces', bounds: null },
      { kind: 'page', id: 'car', bounds: { x: 1920, y: 0, width: 1600, height: 900 } },
    ],
  })
  assert.equal(readPitWallWindows({}), null)
  assert.equal(readPitWallWindows(null), null)
})

test('saved bounds on an unplugged monitor are dropped', () => {
  const displays = [{ x: 0, y: 0, width: 1920, height: 1040 }]
  const bounds = { x: 100, y: 100, width: 1200, height: 800 }
  assert.deepEqual(onScreen(bounds, displays), bounds)
  assert.equal(onScreen({ ...bounds, x: 2400 }, displays), null)
  assert.equal(onScreen({ ...bounds, y: -700 }, displays), null, 'title bar above the screen')
  assert.equal(onScreen(null, displays), null)
})
