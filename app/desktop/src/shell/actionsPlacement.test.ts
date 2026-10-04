import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actionsPlacement } from './actionsPlacement'

test('actions that fit stay in the toolbar', () => {
  assert.equal(actionsPlacement({ available: 400, needed: 300, current: 'toolbar' }), 'toolbar')
})

test('actions wider than the free toolbar space move to the content', () => {
  assert.equal(actionsPlacement({ available: 299, needed: 300, current: 'toolbar' }), 'content')
})

test('evicted actions stay in the content while the room is only just enough, so a resize at the edge cannot flap', () => {
  assert.equal(actionsPlacement({ available: 300, needed: 300, current: 'content' }), 'content')
  assert.equal(actionsPlacement({ available: 320, needed: 300, current: 'content' }), 'content')
})

test('evicted actions return to the toolbar once there is clear room', () => {
  assert.equal(actionsPlacement({ available: 340, needed: 300, current: 'content' }), 'toolbar')
})
