import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  DEFAULT_DASH_EDITOR_UI_PREFERENCES,
  normalizeDashEditorUIPreferences,
} from './dashEditorUIPreferences.ts'

const dashEditModeSource = readFileSync(new URL('../DashEditMode.tsx', import.meta.url), 'utf8')

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

test('editor top bar exposes the Graphite layout alerts and settings views', () => {
  assert.match(dashEditModeSource, /setEditorTab\('settings'\)/)
  assert.match(dashEditModeSource, /\bSegmentedControl\b/)
  assert.match(dashEditModeSource, /label="Editor view"/)
  assert.match(dashEditModeSource, /\{ value: 'layout', label: 'Layout' \}/)
  assert.match(dashEditModeSource, /\{ value: 'alerts', label: 'Alerts' \}/)
  assert.match(dashEditModeSource, /\{ value: 'settings', label: 'Settings' \}/)
  assert.doesNotMatch(dashEditModeSource, /\bfseg\b/)
  assert.doesNotMatch(dashEditModeSource, /const defaultDashBrand/)
  assert.doesNotMatch(dashEditModeSource, /numericFont: 'Saira'/)
})
