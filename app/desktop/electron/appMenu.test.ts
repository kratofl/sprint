import assert from 'node:assert/strict'
import test from 'node:test'
import { macMenuTemplate } from './appMenu'

test('a packaged macOS build gets only the standard app, File, Edit and Window menus — no reload, DevTools or debug window', () => {
  assert.deepEqual(macMenuTemplate({ packaged: true, onToggleLook: () => {}, onOpenDebug: () => {} }), [{ role: 'appMenu' }, { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
})
