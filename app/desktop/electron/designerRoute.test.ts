import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readDashIds, readDesignerDashId } from './designerRoute.js'

test('a designer opens only for a plausible dash id', () => {
  assert.equal(readDesignerDashId('driver-focus'), 'driver-focus')
  for (const value of [undefined, 42, '', 'x'.repeat(201), { id: 'a' }]) {
    assert.throws(() => readDesignerDashId(value))
  }
})

test('dash ids come from the state, and a state without a dash list closes nothing', () => {
  assert.deepEqual(readDashIds({ dashLayouts: [{ id: 'a' }, { name: 'no id' }, { id: 'b' }] }), new Set(['a', 'b']))
  assert.deepEqual(readDashIds({ dashLayouts: [] }), new Set())
  assert.equal(readDashIds({}), null)
  assert.equal(readDashIds(null), null)
})
