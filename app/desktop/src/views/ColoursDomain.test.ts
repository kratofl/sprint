import assert from 'node:assert/strict'
import { test } from 'node:test'
import { defaultDashColours } from '@sprint/dashboard'
import { colourLimitText, stepColourLimit } from './ColoursDomain'

const limits = defaultDashColours.limits

test('a mark steps by its own size and stops at the end of its range', () => {
  assert.equal(stepColourLimit(limits, 'tyreColdBelow', 1), 11)
  assert.equal(stepColourLimit(limits, 'brakeHotAbove', 1), 825)
  assert.equal(stepColourLimit(limits, 'wearLowBelow', -1), 55)
  assert.equal(stepColourLimit({ ...limits, tyreColdBelow: 1 }, 'tyreColdBelow', -1), null)
  assert.equal(stepColourLimit({ ...limits, brakeHotAbove: 1200 }, 'brakeHotAbove', 1), null)
})

test('a mark never steps onto or past its neighbour', () => {
  assert.equal(stepColourLimit({ ...limits, tyreWarmAbove: 19 }, 'tyreWarmAbove', 1), null)
  assert.equal(stepColourLimit({ ...limits, brakeWarmAbove: 775 }, 'brakeHotAbove', -1), null)
  assert.equal(stepColourLimit({ ...limits, energyCriticalBelow: 45 }, 'energyLowBelow', -1), null)
  assert.equal(stepColourLimit({ ...limits, wearCriticalBelow: 55 }, 'wearCriticalBelow', 1), null)
})

test('limits read in the driver’s units: tyres against the ideal, brakes in degrees, levels in percent', () => {
  assert.equal(colourLimitText('tyreColdBelow', 10, 'Metric'), 'ideal −10°')
  assert.equal(colourLimitText('tyreHotAbove', 20, 'Imperial'), 'ideal +36°')
  assert.equal(colourLimitText('brakeWarmAbove', 650, 'Metric'), '650°')
  assert.equal(colourLimitText('brakeWarmAbove', 650, 'Imperial'), '1202°')
  assert.equal(colourLimitText('energyLowBelow', 50, 'Imperial'), '50 %')
})
