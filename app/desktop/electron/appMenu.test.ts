import assert from 'node:assert/strict'
import test from 'node:test'
import { macMenuTemplate } from './appMenu'

test('a packaged macOS build gets only the standard app, File, Edit and Window menus — no reload or DevTools', () => {
  assert.deepEqual(macMenuTemplate({ packaged: true }), [{ role: 'appMenu' }, { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
})
