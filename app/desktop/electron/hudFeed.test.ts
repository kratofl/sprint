import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HUD_CLOSED, hudMessageFor, readHudWanted } from './hudFeed.js'

const state = (compare: Record<string, unknown>) => ({
  compare,
  settings: { liveCompare: { showDelta: true, panelIds: ['throttle', 'brake'] } },
})

test('the HUD is up while training or arranging, and takes clicks only while arranging', () => {
  assert.deepEqual(readHudWanted(state({ hudOpen: true })), { open: true, arranging: false, panelIds: ['throttle', 'brake'], showDelta: true })
  assert.deepEqual(readHudWanted(state({ hudOpen: false, arranging: true })), { open: true, arranging: true, panelIds: ['throttle', 'brake'], showDelta: true })
  assert.deepEqual(readHudWanted(state({ hudOpen: false })), HUD_CLOSED)
  assert.deepEqual(readHudWanted({}), HUD_CLOSED, 'an older host without compare keeps the HUD shut')
})

test('a chart window is sent its own panel, the delta window only the numbers, the palette only the readings', () => {
  const frame = {
    targetName: '2:05.3 · Lap 5, Sep 28',
    deltaSeconds: -0.2,
    carMeters: 1200,
    domain: { min: 1000, max: 1800 },
    panels: [{ id: 'throttle', title: 'Throttle' }, { id: 'brake', title: 'Brake' }],
  }
  const wanted = { open: true, arranging: true, panelIds: ['throttle', 'brake'], showDelta: true }
  const common = { arranging: true, readings: { panelIds: ['throttle', 'brake'], showDelta: true } }

  assert.deepEqual(hudMessageFor('brake', 'Brake', frame, wanted), {
    kind: 'chart',
    id: 'brake',
    title: 'Brake',
    ...common,
    panel: { id: 'brake', title: 'Brake' },
    domain: { min: 1000, max: 1800 },
    carMeters: 1200,
  })
  assert.deepEqual(hudMessageFor('delta', 'Delta', frame, wanted), {
    kind: 'delta',
    id: 'delta',
    title: 'Delta',
    ...common,
    targetName: '2:05.3 · Lap 5, Sep 28',
    deltaSeconds: -0.2,
    carMeters: 1200,
  })
  assert.deepEqual(hudMessageFor('arrange', 'Arrange the HUD', frame, wanted), { kind: 'arrange', id: 'arrange', title: 'Arrange the HUD', ...common })
  assert.equal(hudMessageFor('speed', 'Speed', frame, wanted).panel, null, 'a reading the frame does not carry draws nothing')
})
