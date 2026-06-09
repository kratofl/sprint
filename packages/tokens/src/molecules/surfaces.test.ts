import test from 'node:test'
import assert from 'node:assert/strict'

import { borders } from './borders.ts'
import { shadows } from './shadows.ts'
import { surfaces, outlineColor, outlineStrongColor } from './surfaces.ts'

test('standard desktop surfaces follow the true-neutral Sprint scale', () => {
  assert.equal(surfaces.screen, '#0a0a0a')
  assert.equal(surfaces.deep, '#050505')
  assert.equal(surfaces.panel, '#0f0f0f')
  assert.equal(surfaces.tile2, '#141414')
  assert.equal(surfaces.tile3, '#1a1a1a')
  assert.equal(surfaces.tile4, '#1f1f1f')
})

test('overlay surfaces remain solid neutral panels without blur-dependent rgba glass', () => {
  assert.equal(surfaces.overlay, surfaces.deep)
  assert.equal(surfaces.overlayPanel, surfaces.panel)
})

test('structural borders use the new neutral outline pair', () => {
  assert.equal(outlineColor, '#2e2e2e')
  assert.equal(outlineStrongColor, '#424242')
  assert.equal(borders.outline, '#2e2e2e')
  assert.equal(borders.outlineSubtle, '#424242')
})

test('component shadows are inert except the desktop window lift', () => {
  assert.equal(shadows.sm, 'none')
  assert.equal(shadows.md, 'none')
  assert.equal(shadows.lg, 'none')
  assert.equal(shadows.glow, 'none')
  assert.equal(shadows['glow-teal'], 'none')
  assert.match(shadows.window, /^0 /)
})
