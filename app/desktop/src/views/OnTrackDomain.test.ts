import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildToggleReading } from './OnTrackDomain'

test('a reading turned on takes its place in the column, not the end of it', () => {
  const readings = { panelIds: ['throttle', 'speed'], showDelta: true, locked: false }

  assert.deepEqual(buildToggleReading(readings, 'brake'), { type: 'compare.readings', panelIds: ['throttle', 'brake', 'speed'], showDelta: true })
  assert.deepEqual(buildToggleReading(readings, 'throttle'), { type: 'compare.readings', panelIds: ['speed'], showDelta: true })
  assert.deepEqual(buildToggleReading(readings, 'delta'), { type: 'compare.readings', panelIds: ['throttle', 'speed'], showDelta: false })
})
