import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APP_EVENTS,
  DASH_EVENTS,
  DEVICE_EVENTS,
  SCREEN_EVENTS,
  TELEMETRY_EVENTS,
  UPDATE_EVENTS,
} from './desktopEvents.ts'

test('desktop event constants keep canonical Wails event names grouped by domain', () => {
  assert.deepEqual(APP_EVENTS, {
    ready: 'app:ready',
  })

  assert.deepEqual(TELEMETRY_EVENTS, {
    frame: 'telemetry:frame',
    connected: 'telemetry:connected',
    disconnected: 'telemetry:disconnected',
  })

  assert.deepEqual(DASH_EVENTS, {
    pageChanged: 'dash:page-changed',
    preview: 'dash:preview',
  })

  assert.deepEqual(SCREEN_EVENTS, {
    connected: 'screen:connected',
    disconnected: 'screen:disconnected',
    driverMissing: 'screen:driver_missing',
  })

  assert.deepEqual(DEVICE_EVENTS, {
    updated: 'devices:updated',
  })

  assert.deepEqual(UPDATE_EVENTS, {
    available: 'update:available',
  })
})
