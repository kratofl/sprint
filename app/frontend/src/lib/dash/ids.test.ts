import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createDashLayerId,
  createDashPageId,
  createDashWidgetStackId,
  createDashWidgetId,
} from './ids.ts'

test('createDash*Id helpers emit compact prefixed ids', () => {
  const ids = [
    createDashWidgetId(),
    createDashPageId(),
    createDashWidgetStackId(),
    createDashLayerId(),
  ]

  for (const id of ids) {
    assert.match(id, /^(widget|page|stack|layer)_[0-9a-z]{8}$/)
    assert.ok(!id.includes('-'))
  }
})
