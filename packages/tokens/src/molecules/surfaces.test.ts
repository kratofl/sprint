import test from 'node:test'
import assert from 'node:assert/strict'

import { borders } from './borders.ts'
import { shadows } from './shadows.ts'
import { surfaces, outlineColor, outlineStrongColor } from './surfaces.ts'

test('standard desktop surfaces follow the Figma flat-UI dark scale', () => {
  assert.equal(surfaces.screen, '#050505')   // Surface/Screen
  assert.equal(surfaces.deep, '#050505')
  assert.equal(surfaces.app, '#0F0F0F')       // Surface/App
  assert.equal(surfaces.panel, '#141414')     // Surface/Panel
  assert.equal(surfaces.tile2, '#1F1F1F')     // Surface/Tile
  assert.equal(surfaces.tile3, '#2E2E2E')     // Surface/Tile 2
  assert.equal(surfaces.tile4, '#424242')     // Surface/Tile 3
})

test('overlay surfaces remain solid neutral panels without blur-dependent rgba glass', () => {
  assert.equal(surfaces.overlay, surfaces.deep)
  assert.equal(surfaces.overlayPanel, surfaces.panel)
})

test('structural borders use the Figma neutral outline pair', () => {
  assert.equal(outlineColor, '#2E2E2E')        // Border/Default
  assert.equal(outlineStrongColor, '#424242')  // Border/Strong
  assert.equal(borders.outline, '#2E2E2E')
  assert.equal(borders.outlineSubtle, '#424242')
})

test('status borders take the Figma family steps', () => {
  assert.equal(borders.accent, '#BF4D00')   // Primary/Border Orange/700
  assert.equal(borders.danger, '#851727')   // Error/Border Red/800
  assert.equal(borders.success, '#0E7445')  // Success/Border Green/700
  assert.equal(borders.teal, '#114F99')     // Info/Border Blue/700
})

test('component shadows are inert except the desktop window lift', () => {
  assert.equal(shadows.sm, 'none')
  assert.equal(shadows.md, 'none')
  assert.equal(shadows.lg, 'none')
  assert.equal(shadows.glow, 'none')
  assert.equal(shadows['glow-teal'], 'none')
  assert.match(shadows.window, /^0 /)
})
