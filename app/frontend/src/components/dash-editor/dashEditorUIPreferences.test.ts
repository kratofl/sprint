import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_DASH_EDITOR_UI_PREFERENCES,
  normalizeDashEditorUIPreferences,
} from './dashEditorUIPreferences.ts'

test('dash editor ui preferences default both sidebars to open and pinned', () => {
  assert.deepEqual(DEFAULT_DASH_EDITOR_UI_PREFERENCES, {
    palette: { open: true, pinned: true },
    inspector: { open: true, pinned: true },
  })
})

test('dash editor ui preferences normalize missing data back to defaults', () => {
  assert.deepEqual(normalizeDashEditorUIPreferences(undefined), {
    palette: { open: true, pinned: true },
    inspector: { open: true, pinned: true },
  })
})

test('dash editor ui preferences preserve per-panel open and pinned flags from partial persisted settings', () => {
  assert.deepEqual(
    normalizeDashEditorUIPreferences({
      palette: { open: false },
      inspector: { pinned: false },
    }),
    {
      palette: { open: false, pinned: true },
      inspector: { open: true, pinned: false },
    },
  )
})
