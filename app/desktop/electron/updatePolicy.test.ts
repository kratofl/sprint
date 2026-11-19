import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAfter, readUpdateSettings, type UpdateSettings } from './updatePolicy.js'

const stable: UpdateSettings = { prerelease: false, autoInstall: true }

test('the settings come from the host state, and are absent until it carries them', () => {
  assert.deepEqual(readUpdateSettings({ updates: { version: '1.0.0', channel: 'pre-release', autoInstall: false } }), { prerelease: true, autoInstall: false })
  assert.deepEqual(readUpdateSettings({ updates: { channel: 'stable', autoInstall: true } }), stable)
  assert.equal(readUpdateSettings({ updates: { channel: 'stable' } }), null)
  assert.equal(readUpdateSettings(null), null)
})

test('the first settings read asks for no check: the launch already decided', () => {
  assert.equal(checkAfter(null, stable, { kind: 'idle' }), false)
})

test('switching channel checks again, unless an update is already on its way', () => {
  const prerelease = { ...stable, prerelease: true }
  assert.equal(checkAfter(stable, prerelease, { kind: 'up-to-date' }), true)
  assert.equal(checkAfter(stable, prerelease, { kind: 'available', version: '1.1.0' }), true)
  assert.equal(checkAfter(stable, prerelease, { kind: 'downloading', version: '1.1.0', percent: 40 }), false)
  assert.equal(checkAfter(stable, prerelease, { kind: 'installing', version: '1.1.0' }), false)
})

test('turning automatic installs on or off asks for nothing while Sprint runs', () => {
  assert.equal(checkAfter({ ...stable, autoInstall: false }, stable, { kind: 'available', version: '1.1.0' }), false)
  assert.equal(checkAfter(stable, { ...stable, autoInstall: false }, { kind: 'up-to-date' }), false)
})
