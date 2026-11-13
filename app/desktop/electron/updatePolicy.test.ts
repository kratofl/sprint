import assert from 'node:assert/strict'
import { test } from 'node:test'
import { followUp, readUpdateSettings, type UpdateSettings } from './updatePolicy.js'

const stable: UpdateSettings = { prerelease: false, autoInstall: true }

test('the settings come from the host state, and are absent until it carries them', () => {
  assert.deepEqual(readUpdateSettings({ updates: { version: '1.0.0', channel: 'pre-release', autoInstall: false } }), { prerelease: true, autoInstall: false })
  assert.deepEqual(readUpdateSettings({ updates: { channel: 'stable', autoInstall: true } }), stable)
  assert.equal(readUpdateSettings({ updates: { channel: 'stable' } }), null)
  assert.equal(readUpdateSettings(null), null)
})

test('the first settings read is the startup check', () => {
  assert.equal(followUp(null, stable, { kind: 'idle' }), 'check')
})

test('switching channel checks again, unless an update is already on its way', () => {
  const prerelease = { ...stable, prerelease: true }
  assert.equal(followUp(stable, prerelease, { kind: 'up-to-date' }), 'check')
  assert.equal(followUp(stable, prerelease, { kind: 'available', version: '1.1.0' }), 'check')
  assert.equal(followUp(stable, prerelease, { kind: 'downloading', version: '1.1.0', percent: 40 }), 'none')
  assert.equal(followUp(stable, prerelease, { kind: 'ready', version: '1.1.0' }), 'none')
})

test('turning automatic installs on fetches the update the driver left waiting', () => {
  const manual = { ...stable, autoInstall: false }
  assert.equal(followUp(manual, stable, { kind: 'available', version: '1.1.0' }), 'download')
  assert.equal(followUp(manual, stable, { kind: 'up-to-date' }), 'none')
  assert.equal(followUp(stable, manual, { kind: 'available', version: '1.1.0' }), 'none')
  assert.equal(followUp(stable, stable, { kind: 'available', version: '1.1.0' }), 'none')
})
