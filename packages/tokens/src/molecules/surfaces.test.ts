import test from 'node:test'
import assert from 'node:assert/strict'

import { surfaces } from './surfaces.ts'

test('standard desktop surfaces flatten to one black base', () => {
  assert.equal(surfaces.base, '#0a0a0a')
  assert.equal(surfaces.shell, surfaces.base)
  assert.equal(surfaces.container, surfaces.base)
  assert.equal(surfaces.elevated, surfaces.base)
})

test('overlay panel stays slightly lifted instead of becoming a second gray ladder step', () => {
  assert.notEqual(surfaces.overlayPanel, surfaces.base)
  assert.match(surfaces.overlayPanel, /^rgba\(/)
})
