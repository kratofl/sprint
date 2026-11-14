import test from 'node:test'
import assert from 'node:assert/strict'
import { multiDialInk } from './multiDial'
import { dashColor } from './palette'

// When the popup is up is the Rust renderer's business (renderer/src/multi_dial.rs tests it).

test('lettering on a position colour is black on light colours and white on dark ones', () => {
  assert.equal(multiDialInk('#E0A30C'), dashColor.background)
  assert.equal(multiDialInk('#F5F5F7'), dashColor.background)
  assert.equal(multiDialInk('#7C3AED'), dashColor.text)
})
