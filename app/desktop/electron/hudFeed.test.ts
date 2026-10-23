import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HUD_CLOSED, hudMessageFor, readHudWanted } from './hudFeed.js'

const state = (hudOpen: boolean) => ({
  compare: { hudOpen },
  settings: { liveCompare: { locked: true, showDelta: true, panelIds: ['throttle', 'brake'] } },
})

test('the HUD is wanted only while the host says it is open', () => {
  assert.deepEqual(readHudWanted(state(true)), { open: true, locked: true, readings: 'delta,throttle,brake' })
  assert.deepEqual(readHudWanted(state(false)), HUD_CLOSED)
  assert.deepEqual(readHudWanted({}), HUD_CLOSED, 'an older host without compare keeps the HUD shut')
})

test('a chart window is sent its own panel and the delta window only the numbers', () => {
  const frame = {
    targetName: '2:05.3 · Lap 5, Sep 28',
    deltaSeconds: -0.2,
    carMeters: 1200,
    domain: { min: 1000, max: 1800 },
    panels: [{ id: 'throttle', title: 'Throttle' }, { id: 'brake', title: 'Brake' }],
  }

  assert.deepEqual(hudMessageFor('brake', frame, false), {
    kind: 'chart',
    locked: false,
    panel: { id: 'brake', title: 'Brake' },
    domain: { min: 1000, max: 1800 },
    carMeters: 1200,
  })
  assert.deepEqual(hudMessageFor('delta', frame, true), { kind: 'delta', locked: true, targetName: '2:05.3 · Lap 5, Sep 28', deltaSeconds: -0.2 })
  assert.equal(hudMessageFor('speed', frame, false).panel, null, 'a reading the frame does not carry draws nothing')
})
