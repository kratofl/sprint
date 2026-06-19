import test from 'node:test'
import assert from 'node:assert/strict'

import { getDashEditorRuntimeNotice } from './dashEditorRuntime.ts'

test('does not show a desktop runtime notice when the Wails bridge is available', () => {
  assert.equal(getDashEditorRuntimeNotice(true), null)
})

test('shows desktop attach guidance when Dashboards runs outside the Wails runtime', () => {
  assert.deepEqual(getDashEditorRuntimeNotice(false), {
    title: 'Desktop runtime required',
    description: 'Dashboards uses Wails bindings for dashboard creation, preview rendering, and widget catalog data.',
    browserHint: 'The Vite page at http://localhost:5173/ is only for browser-safe UI checks.',
    launchCommand: 'make dev-app-agent',
    waitCommand: 'pwsh -File .\\app\\scripts\\wait-desktop-browser.ps1',
    browserSurfaceUrl: 'http://127.0.0.1:34115',
    browserSurfaceNote: 'Use the default Wails browser URL above or replace the port with the configured Wails devserver port.',
  })
})
