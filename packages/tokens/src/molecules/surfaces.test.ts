import test from 'node:test'
import assert from 'node:assert/strict'

import { borders } from './borders.ts'
import { shadows } from './shadows.ts'
import { surfaces, outlineColor, outlineStrongColor } from './surfaces.ts'

test('standard desktop surfaces follow the calm precision scale', () => {
  assert.equal(surfaces.screen, '#0B0B0D')
  assert.equal(surfaces.deep, '#0B0B0D')
  assert.equal(surfaces.panel, '#101012')
  assert.equal(surfaces.tile2, '#141416')
  assert.equal(surfaces.tile3, '#1B1B1E')
  assert.equal(surfaces.tile4, '#232327')
})

test('overlay surfaces remain solid neutral panels without blur-dependent rgba glass', () => {
  assert.equal(surfaces.overlay, surfaces.deep)
  assert.equal(surfaces.overlayPanel, surfaces.panel)
})

test('structural borders use the new neutral outline pair', () => {
  assert.equal(outlineColor, 'rgba(255,255,255,.07)')
  assert.equal(outlineStrongColor, 'rgba(255,255,255,.12)')
  assert.equal(borders.outline, 'rgba(255,255,255,.07)')
  assert.equal(borders.outlineSubtle, 'rgba(255,255,255,.12)')
})

test('component shadows are inert except the desktop window lift', () => {
  assert.equal(shadows.sm, 'none')
  assert.equal(shadows.md, 'none')
  assert.equal(shadows.lg, 'none')
  assert.equal(shadows.glow, 'none')
  assert.equal(shadows['glow-teal'], 'none')
  assert.match(shadows.window, /^0 /)
})
