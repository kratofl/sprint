import test from 'node:test'
import assert from 'node:assert/strict'
import { niceTicks } from './ticks.ts'

test('plain values step 1, 2 or 5 × 10ⁿ', () => {
  assert.deepEqual(niceTicks([0, 3, 7], 3), [0, 5, 10])
  assert.deepEqual(niceTicks([-4, 12], 4), [-5, 0, 5, 10, 15])
  assert.deepEqual(niceTicks([], 3), [0, 1])
})

test('lap times step the way a clock reads, not 50 s', () => {
  // A 1:40 lap: a minute per gridline, not 0:50 / 1:40.
  assert.deepEqual(niceTicks([98.4, 100.2, 101.7], 3, 1, 'duration'), [0, 60, 120])
  // Short splits: 15 s.
  assert.deepEqual(niceTicks([31.2, 40.9], 3, 1, 'duration'), [0, 15, 30, 45])
  // A long stint: 30 minutes, then hours.
  assert.deepEqual(niceTicks([4000], 3, 1, 'duration'), [0, 1800, 3600, 5400])
  assert.deepEqual(niceTicks([20_000], 3, 1, 'duration'), [0, 7200, 14_400, 21_600])
})
