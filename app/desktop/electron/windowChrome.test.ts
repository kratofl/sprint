import assert from 'node:assert/strict'
import test from 'node:test'
import { windowChrome, windowLook } from './windowChrome'

test('Windows and Linux paint the solid brand background, caption buttons in the label colour', () => {
  assert.deepEqual(windowChrome({ look: 'windows', dark: false }), { kind: 'solid', background: '#fafafa', symbol: '#18181b' })
  assert.deepEqual(windowChrome({ look: 'windows', dark: true }), { kind: 'solid', background: '#09090b', symbol: '#ededef' })
})

test('macOS gets the native look; every other OS wears the brand look', () => {
  assert.equal(windowLook('darwin'), 'mac')
  assert.equal(windowLook('win32'), 'windows')
  assert.equal(windowLook('linux'), 'windows')
})

test('macOS draws the sidebar with system vibrancy in either theme', () => {
  assert.deepEqual(windowChrome({ look: 'mac', dark: false, reducedTransparency: false, vibrancySupported: true }), { kind: 'vibrancy' })
  assert.deepEqual(windowChrome({ look: 'mac', dark: true, reducedTransparency: false, vibrancySupported: true }), { kind: 'vibrancy' })
})

test('macOS "Reduce transparency" falls back to the solid sidebar colour', () => {
  assert.deepEqual(windowChrome({ look: 'mac', dark: false, reducedTransparency: true, vibrancySupported: true }), { kind: 'opaque', background: '#f6f6f8' })
  assert.deepEqual(windowChrome({ look: 'mac', dark: true, reducedTransparency: true, vibrancySupported: true }), { kind: 'opaque', background: '#28282a' })
})

test('the macOS look off macOS has no vibrancy and shows the solid sidebar colour', () => {
  assert.deepEqual(windowChrome({ look: 'mac', dark: false, reducedTransparency: false, vibrancySupported: false }), { kind: 'opaque', background: '#f6f6f8' })
})
