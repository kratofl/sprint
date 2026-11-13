import assert from 'node:assert/strict'
import { test } from 'node:test'
import { presetChoices } from './choices'

test('a picker offers its presets and keeps a value set by hand, in order', () => {
  assert.deepEqual(presetChoices([300, 400, 600], 600), [300, 400, 600])
  assert.deepEqual(presetChoices([100, 200, 300, 500], 250), [100, 200, 250, 300, 500])
  assert.deepEqual(presetChoices([0, 1, 2, 3], 7), [0, 1, 2, 3, 7])
})
