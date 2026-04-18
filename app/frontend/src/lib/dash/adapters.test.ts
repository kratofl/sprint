import test from 'node:test'
import assert from 'node:assert/strict'

import { adaptCatalogEntry, adaptSavedDevice } from './adapters.ts'

test('adaptSavedDevice maps snake_case desktop payloads into camelCase frontend models', () => {
  const adapted = adaptSavedDevice({
    vid: 0x1234,
    pid: 0x5678,
    serial: 'wheel-a',
    type: 'screen',
    width: 800,
    height: 480,
    name: 'Primary dash',
    rotation: 90,
    target_fps: 60,
    offset_x: 12,
    offset_y: 34,
    margin: 5,
    driver: 'vocore',
    dash_id: 'main-layout',
    purpose: 'rear_view',
    purpose_config: {
      capture_x: 10,
      capture_y: 20,
      capture_w: 300,
      capture_h: 120,
      idle_mode: 'clock',
    },
    bindings: [{ button: 4, command: 'dash.page.next' }],
    disabled: true,
  })

  assert.deepEqual(adapted, {
    vid: 0x1234,
    pid: 0x5678,
    serial: 'wheel-a',
    type: 'screen',
    width: 800,
    height: 480,
    name: 'Primary dash',
    rotation: 90,
    targetFps: 60,
    offsetX: 12,
    offsetY: 34,
    margin: 5,
    driver: 'vocore',
    dashId: 'main-layout',
    purpose: 'rear_view',
    purposeConfig: {
      captureX: 10,
      captureY: 20,
      captureW: 300,
      captureH: 120,
      idleMode: 'clock',
    },
    bindings: [{ button: 4, command: 'dash.page.next' }],
    disabled: true,
  })
})

test('adaptCatalogEntry preserves optional bindings and defaults the purpose to dash', () => {
  const adapted = adaptCatalogEntry({
    id: 'generic-vocore',
    name: 'Generic VoCore',
    description: 'Fallback entry',
    type: 'screen',
    vid: 0,
    pid: 0,
    width: 800,
    height: 480,
    rotation: 0,
    driver: 'vocore',
  })

  assert.equal(adapted.purpose, 'dash')
  assert.deepEqual(adapted.bindings, [])
  assert.equal(adapted.margin, 0)
})
