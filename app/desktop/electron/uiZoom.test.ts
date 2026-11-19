import assert from 'node:assert/strict'
import test from 'node:test'
import { nextZoomFactor, zoomStepFor } from './uiZoom'

const key = (key: string, mods: { control?: boolean; meta?: boolean; alt?: boolean } = {}) => ({
  type: 'keyDown' as const,
  key,
  control: mods.control ?? false,
  meta: mods.meta ?? false,
  alt: mods.alt ?? false,
})

test('Ctrl with +, =, − or 0 zooms on Windows; ⌘ does on macOS', () => {
  assert.equal(zoomStepFor(key('+', { control: true }), false), 'in')
  assert.equal(zoomStepFor(key('=', { control: true }), false), 'in')
  assert.equal(zoomStepFor(key('-', { control: true }), false), 'out')
  assert.equal(zoomStepFor(key('0', { control: true }), false), 'reset')
  assert.equal(zoomStepFor(key('+', { meta: true }), true), 'in')
  assert.equal(zoomStepFor(key('+', { control: true }), true), null)
  assert.equal(zoomStepFor(key('+', { meta: true }), false), null)
})

test('bare keys, AltGr combinations and key-ups are left alone', () => {
  assert.equal(zoomStepFor(key('+'), false), null)
  assert.equal(zoomStepFor(key('0', { control: true, alt: true }), false), null)
  assert.equal(zoomStepFor({ ...key('+', { control: true }), type: 'keyUp' }, false), null)
})

test('zoom walks the presets and stops at 50% and 200%', () => {
  assert.equal(nextZoomFactor(1, 'in'), 1.1)
  assert.equal(nextZoomFactor(1, 'out'), 0.9)
  assert.equal(nextZoomFactor(2, 'in'), 2)
  assert.equal(nextZoomFactor(0.5, 'out'), 0.5)
  assert.equal(nextZoomFactor(1.3, 'in'), 1.5)
  assert.equal(nextZoomFactor(1.75, 'reset'), 1)
})
