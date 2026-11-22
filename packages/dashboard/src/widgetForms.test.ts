import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formIndex, hasLabel, holdsSmallest, referenceSize } from './widgetForms'

test('a box draws the largest form it holds, measured at 800x480', () => {
  assert.equal(formIndex('tyre', 180, 120), 0)
  assert.equal(formIndex('tyre', 180, 90), 1)
  assert.equal(formIndex('tyre', 40, 40), 2, 'below its smallest form it still draws that one')
  assert.deepEqual(referenceSize(1600, 960, { width: 360, height: 222 }), { width: 180, height: 111 })
  assert.equal(holdsSmallest('last_lap', { width: 120, height: 55 }), false)
  assert.equal(holdsSmallest('speed', { width: 90, height: 55 }), true, 'a type with no forms of its own has the default')
  assert.equal(hasLabel('gear'), false)
  assert.equal(hasLabel('tc'), true)
})
