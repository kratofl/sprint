import assert from 'node:assert/strict'
import { test } from 'node:test'
import { debugView, formatTime, lapCount, parseDebugMessage, pedal } from './debugModel'

/** A host snapshot as `/api/debug` sends it, trimmed to what these tests read. */
const snapshot = (patch: { hud?: Record<string, unknown>; screens?: unknown[]; session?: Record<string, unknown> } = {}) => ({
  telemetry: { source: 'Le Mans Ultimate', state: 'Connected', hz: 49.6, frameAgeMs: 31, lastFrameValid: true },
  session: { track: 'Spa', lap: 12, maxLaps: 0, timeRemainingSeconds: null, delta: -0.25, targetLapTime: 128.4, ...patch.session },
  car: { speedKph: 251.4, gear: 6, rpm: 7800, maxRpm: 8500, throttle: 1, throttleApplied: 0.82, brake: 0, electronics: { tc: 3, tcMax: 11, absMax: 0 }, corners: [{ position: 'FrontLeft', tempInner: 85 }] },
  screens: patch.screens ?? [],
  sprint: { hud: patch.hud ?? {}, link: { phase: 'Off' }, recorder: null, timings: { stateBuildMs: 3.2 } },
})

test('a debug message is narrowed once; anything missing reads as unknown, never as 0', () => {
  const message = parseDebugMessage({ snapshot: snapshot(), statePollMs: 8, onTop: true })
  assert.ok(message?.snapshot)
  assert.equal(message.onTop, true)
  assert.equal(message.snapshot.car.brakeApplied, null)
  assert.equal(message.snapshot.car.fuelLiters, null)
  assert.equal(message.snapshot.car.corners[0]?.pressureKPa, null)
  assert.equal(message.snapshot.sprint.link.phase, 'Off')
  // A Release host has no endpoint: the reason comes through instead of a snapshot.
  assert.deepEqual(parseDebugMessage({ snapshot: null, error: 'Runtime 404: ', statePollMs: 8, onTop: false }), { snapshot: null, error: 'Runtime 404: ', statePollMs: 8, onTop: false })
  assert.equal(parseDebugMessage('nope'), null)
})

test('laps, pedals and times read the way a driver says them', () => {
  assert.equal(lapCount(12, 0), '12 · no lap limit')
  assert.equal(lapCount(12, 30), '12 / 30')
  assert.equal(lapCount(0, 2147483647), '0 · no lap limit (2147483647)')
  assert.equal(pedal(1, 0.82), '100% → 82%')
  assert.equal(pedal(0.5, null), '50%')
  assert.equal(formatTime(128.4), '2:08.400')
  assert.equal(formatTime(3725, { millis: false }), '1:02:05')
  assert.equal(formatTime(0), '—')
})

test('the window warns about exclusive fullscreen and says a screen is not running rather than 0 fps', () => {
  const message = parseDebugMessage({
    snapshot: snapshot({ hud: { exclusiveFullscreen: true }, screens: [{ deviceId: 'd1', name: 'Wheel', driver: 'vocore', width: 800, height: 480, refreshHz: 60, state: null }] }),
    statePollMs: 8,
    onTop: false,
  })
  assert.ok(message)
  const view = debugView(message)
  assert.equal(view.kind, 'ready')
  if (view.kind !== 'ready') return
  assert.deepEqual(view.notices.map((notice) => notice.title), ['Exclusive fullscreen'])
  assert.equal(view.screens[0]?.status, 'No output')
  assert.equal(view.screens[0]?.rows.find((row) => row.label === 'Output')?.value, 'Not running')
  assert.equal(view.tiles.find((tile) => tile.label === 'Delta')?.value, '−0.250')
  // A car without ABS says so instead of "0 / 0".
  const car = view.sections.find((section) => section.title === 'Car')
  assert.equal(car?.rows.find((row) => row.label === 'ABS')?.value, 'None')
  assert.equal(car?.rows.find((row) => row.label === 'TC')?.value, '3 / 11')

  assert.deepEqual(debugView({ snapshot: null, error: 'Runtime 404: ', statePollMs: null, onTop: false }), { kind: 'unavailable', reason: 'Runtime 404: ' })
})
