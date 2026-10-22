import assert from 'node:assert/strict'
import test from 'node:test'
import { supportsMica, windowChrome, windowLook } from './windowChrome'

test('Mica when the OS supports it and transparency is on', () => {
  assert.deepEqual(windowChrome({ look: 'windows', dark: false, reducedTransparency: false, micaSupported: true }), { kind: 'mica', symbol: '#1a1a1a' })
})

test('Windows "Transparency effects" off falls back to the solid Mica colour', () => {
  assert.deepEqual(windowChrome({ look: 'windows', dark: true, reducedTransparency: true, micaSupported: true }), {
    kind: 'solid',
    background: '#202020',
    symbol: '#ffffff',
  })
})

test('no Mica before Windows 11 22H2 or off Windows', () => {
  assert.equal(supportsMica('win32', '10.0.26200'), true)
  assert.equal(supportsMica('win32', '10.0.22621'), true)
  assert.equal(supportsMica('win32', '10.0.22000'), false)
  assert.equal(supportsMica('win32', '10.0.19045'), false)
  assert.equal(supportsMica('linux', '6.8.0'), false)
  assert.deepEqual(windowChrome({ look: 'windows', dark: false, reducedTransparency: false, micaSupported: false }).kind, 'solid')
})

test('macOS gets the native look; every other OS keeps the Windows look', () => {
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
