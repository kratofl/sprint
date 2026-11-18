import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makerColors } from './makerBadge'

test("a maker's badge takes its colour and whichever ink reads better on it", () => {
  assert.deepEqual(makerColors('Porsche'), { fill: '#B12B28', ink: 'light' })
  assert.deepEqual(makerColors('Lamborghini'), { fill: '#B6A272', ink: 'dark' })
  assert.deepEqual(makerColors('Mercedes-AMG'), { fill: '#000000', ink: 'light' })
  assert.equal(makerColors('Unknown'), null)
  assert.equal(makerColors(null), null)
})
