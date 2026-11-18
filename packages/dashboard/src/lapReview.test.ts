import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LAP_REVIEW_CELLS, lapReviewCells } from './lapReview'

test('a lap review cell that is missing or unknown reads as the default in its place, as the renderer draws it', () => {
  assert.deepEqual(lapReviewCells(undefined), DEFAULT_LAP_REVIEW_CELLS)
  assert.deepEqual(lapReviewCells({ cells: ['lap', 'rpm', 'none'] }), ['lap', 'sector2', 'none', 'position', 'fuel_used', 'target'])
  assert.deepEqual(lapReviewCells({ cells: ['none', 'none', 'none', 'none', 'none', 'none', 'lap'] }), ['none', 'none', 'none', 'none', 'none', 'none'])
})
