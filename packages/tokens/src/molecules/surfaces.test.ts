import test from 'node:test'
import assert from 'node:assert/strict'

import { borders } from './borders.ts'
import { shadows } from './shadows.ts'
import { surfaces, outlineColor, outlineStrongColor } from './surfaces.ts'

test('standard desktop surfaces follow the true-neutral Sprint scale', () => {
  assert.equal(surfaces.screen, '#0A0A0A')
  assert.equal(surfaces.deep, '#0A0A0A')
  assert.equal(surfaces.panel, '#0F0F0F')
  assert.equal(surfaces.tile2, '#141414')
  assert.equal(surfaces.tile3, '#1A1A1A')
  assert.equal(surfaces.tile4, '#1F1F1F')
})

test('overlay surfaces remain solid neutral panels without blur-dependent rgba glass', () => {
  assert.equal(surfaces.overlay, surfaces.deep)
  assert.equal(surfaces.overlayPanel, surfaces.panel)
})

test('structural borders use the new neutral outline pair', () => {
  assert.equal(outlineColor, '#2E2E2E')
  assert.equal(outlineStrongColor, '#424242')
  assert.equal(borders.outline, '#2E2E2E')
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
