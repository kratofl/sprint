import test from 'node:test'
import assert from 'node:assert/strict'

import { hasDesktopAppBridge, hasDesktopEventBridge } from './desktopRuntime.ts'

test('desktop app bridge detection stays false for plain browser windows', () => {
  assert.equal(hasDesktopAppBridge(undefined), false)
  assert.equal(hasDesktopAppBridge({}), false)
  assert.equal(hasDesktopAppBridge({ go: {} }), false)
})

test('desktop app bridge detection only turns on once the Wails app binding exists', () => {
  assert.equal(hasDesktopAppBridge({ go: { main: { App: {} } } }), true)
})

test('desktop event bridge detection requires the Wails runtime event methods', () => {
  assert.equal(hasDesktopEventBridge(undefined), false)
  assert.equal(hasDesktopEventBridge({}), false)
  assert.equal(hasDesktopEventBridge({ runtime: {} }), false)
  assert.equal(
    hasDesktopEventBridge({
      runtime: {
        EventsOnMultiple: () => undefined,
        EventsOff: () => undefined,
      },
    }),
    true,
  )
})
