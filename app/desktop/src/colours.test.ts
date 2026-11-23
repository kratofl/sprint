import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultDashColours } from '@sprint/dashboard'
import { brakeHeat, parseColours, tyreHeat } from './colours'

const limits = defaultDashColours.limits

test('tyres change colour against the compound’s ideal, or 90° when the game names none', () => {
  assert.deepEqual([74, 75, 95, 96, 106].map((celsius) => tyreHeat(celsius, 85, limits)), ['cold', 'ok', 'ok', 'warm', 'hot'])
  assert.deepEqual([79, 101, 111].map((celsius) => tyreHeat(celsius, 0, limits)), ['cold', 'warm', 'hot'])
})

test('brakes change colour at the driver’s marks', () => {
  assert.deepEqual([250, 480, 700, 850].map((celsius) => brakeHeat(celsius, limits)), ['cold', 'ok', 'warm', 'hot'])
  assert.equal(brakeHeat(700, { ...limits, brakeWarmAbove: 750, brakeHotAbove: 900 }), 'ok')
})

test('the host’s colours are narrowed once; anything missing or unknown is the default', () => {
  assert.deepEqual(parseColours(undefined), defaultDashColours)
  assert.deepEqual(parseColours({ theme: 'Calm', limits: { brakeHotAbove: 900, tyreColdBelow: 'x' } }), {
    theme: 'Calm',
    limits: { ...limits, brakeHotAbove: 900 },
  })
  assert.equal(parseColours({ theme: 'calm' }).theme, 'Sprint', 'by name, as the host writes it')
})
