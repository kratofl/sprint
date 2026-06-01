import test from 'node:test'
import assert from 'node:assert/strict'

import { surfaces } from './surfaces.ts'

test('standard desktop surfaces follow the flat Figma warm-black scale', () => {
  assert.equal(surfaces.base, '#090907')
  assert.equal(surfaces.shell, '#090907')
  assert.equal(surfaces.container, '#12110f')
  assert.equal(surfaces.elevated, '#1a1815')
})

test('overlay panel stays slightly lifted instead of becoming a second gray ladder step', () => {
  assert.notEqual(surfaces.overlayPanel, surfaces.base)
  assert.match(surfaces.overlayPanel, /^rgba\(/)
})
