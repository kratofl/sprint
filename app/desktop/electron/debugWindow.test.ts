import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_DEBUG_PREFS, readDebugWindowPrefs } from './debugWindow.js'

test('the debug window remembers its place and toggle, and anything unreadable is the defaults', () => {
  assert.deepEqual(readDebugWindowPrefs({ bounds: { x: 10, y: 20, width: 440, height: 800 }, onTop: true }), {
    bounds: { x: 10, y: 20, width: 440, height: 800 },
    onTop: true,
  })
  assert.deepEqual(readDebugWindowPrefs({ bounds: { x: 10, y: 'top', width: 440, height: 800 } }), { bounds: null, onTop: false })
  for (const value of [null, 'x', [], undefined]) assert.deepEqual(readDebugWindowPrefs(value), DEFAULT_DEBUG_PREFS)
})
