import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readSidebarCollapsed } from './settings'

test('readSidebarCollapsed reads the boolean field and defaults to false', () => {
  assert.equal(readSidebarCollapsed({ sidebarCollapsed: true }), true)
  assert.equal(readSidebarCollapsed({ sidebarCollapsed: false }), false)
  assert.equal(readSidebarCollapsed({}), false)
  assert.equal(readSidebarCollapsed({ sidebarCollapsed: 'true' }), false)
})
