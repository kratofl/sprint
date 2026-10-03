import assert from 'node:assert/strict'
import test from 'node:test'
import { supportsMica, windowChrome } from './windowChrome'

test('Mica when the OS supports it and transparency is on', () => {
  assert.deepEqual(windowChrome({ dark: false, reducedTransparency: false, micaSupported: true }), { kind: 'mica', symbol: '#1a1a1a' })
})

test('Windows "Transparency effects" off falls back to the solid Mica colour', () => {
  assert.deepEqual(windowChrome({ dark: true, reducedTransparency: true, micaSupported: true }), {
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
  assert.deepEqual(windowChrome({ dark: false, reducedTransparency: false, micaSupported: false }).kind, 'solid')
})
