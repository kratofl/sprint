import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchSuggestions } from './suggestions'

const tracks = ['Circuit de la Sarthe', 'Monza', 'Spa-Francorchamps', 'Sebring']

test('blank text lists every value', () => {
  assert.deepEqual(matchSuggestions(tracks, '  '), tracks)
})

test('typed text matches case-insensitively, prefix matches first', () => {
  assert.deepEqual(matchSuggestions(tracks, 'S'), ['Spa-Francorchamps', 'Sebring', 'Circuit de la Sarthe'])
  assert.deepEqual(matchSuggestions(tracks, 'mon'), ['Monza'])
  assert.deepEqual(matchSuggestions(tracks, 'Nürburgring'), [])
})
