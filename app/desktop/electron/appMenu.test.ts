import assert from 'node:assert/strict'
import test from 'node:test'
import { macMenuTemplate } from './appMenu'

test('a packaged macOS build gets only the standard menus plus View zoom — no reload, DevTools or debug window', () => {
  const template = macMenuTemplate({ packaged: true, onToggleLook: () => {}, onOpenDebug: () => {}, onZoom: () => {} })
  assert.deepEqual(template.map((menu) => menu.role ?? menu.label), ['appMenu', 'fileMenu', 'editMenu', 'View', 'windowMenu'])
  const view = template[3].submenu
  assert.ok(Array.isArray(view))
  assert.deepEqual(view.map((item) => item.label), ['Actual Size', 'Zoom In', 'Zoom Out'])
})
