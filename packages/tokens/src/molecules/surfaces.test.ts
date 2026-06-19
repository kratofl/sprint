import test from 'node:test'
import assert from 'node:assert/strict'

import { borders } from './borders.ts'
import { shadows } from './shadows.ts'
import { surfaces, outlineColor, outlineStrongColor } from './surfaces.ts'

test('standard desktop surfaces follow the true-neutral Sprint scale', () => {
  assert.equal(surfaces.screen, '#070707')
  assert.equal(surfaces.deep, '#070707')
  assert.equal(surfaces.panel, '#0D0D0D')
  assert.equal(surfaces.tile2, '#131313')
  assert.equal(surfaces.tile3, '#1B1B1B')
  assert.equal(surfaces.tile4, '#1F1F1F')
})

test('overlay surfaces remain solid neutral panels without blur-dependent rgba glass', () => {
  assert.equal(surfaces.overlay, surfaces.deep)
  assert.equal(surfaces.overlayPanel, surfaces.panel)
})

test('structural borders use the new neutral outline pair', () => {
  assert.equal(outlineColor, '#1A1A1A')
  assert.equal(outlineStrongColor, '#232323')
  assert.equal(borders.outline, '#1A1A1A')
  assert.equal(borders.outlineSubtle, '#232323')
})

test('component shadows are inert except the desktop window lift', () => {
  assert.equal(shadows.sm, 'none')
  assert.equal(shadows.md, 'none')
  assert.equal(shadows.lg, 'none')
  assert.equal(shadows.glow, 'none')
  assert.equal(shadows['glow-teal'], 'none')
  assert.match(shadows.window, /^0 /)
})
