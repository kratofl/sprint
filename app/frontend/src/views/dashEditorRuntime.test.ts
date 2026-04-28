import test from 'node:test'
import assert from 'node:assert/strict'

import { getDashEditorRuntimeNotice } from './dashEditorRuntime.ts'

test('does not show a desktop runtime notice when the Wails bridge is available', () => {
  assert.equal(getDashEditorRuntimeNotice(true), null)
})

test('shows desktop attach guidance when Dash Studio runs outside the Wails runtime', () => {
  assert.deepEqual(getDashEditorRuntimeNotice(false), {
    title: 'DESKTOP RUNTIME REQUIRED',
    description: 'Dash Studio uses Wails bindings for layout creation, preview rendering, and widget catalog data.',
    browserHint: 'The Vite page at http://localhost:5173/ is only for browser-safe UI checks.',
    launchCommand: 'make dev-app-agent',
    waitCommand: 'pwsh -File .\\app\\scripts\\wait-desktop-browser.ps1',
    browserSurfaceUrl: 'http://127.0.0.1:34115',
    browserSurfaceNote: 'Use the default Wails browser URL above or replace the port with SPRINT_WAILS_DEVSERVER_PORT.',
  })
})
