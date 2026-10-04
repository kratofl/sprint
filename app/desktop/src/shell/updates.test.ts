import assert from 'node:assert/strict'
import { test } from 'node:test'
import { displayVersion, parseUpdateCheck } from './updates'

test('parseUpdateCheck returns the release when one is available', () => {
  const release = parseUpdateCheck({
    updateAvailable: true,
    latest: { version: '1.2.3', channel: 'stable', url: 'https://example.test/1.2.3' },
    currentVersion: '1.2.0',
  })
  assert.deepEqual(release, { version: '1.2.3', channel: 'stable', url: 'https://example.test/1.2.3' })
})

test('parseUpdateCheck returns null when up to date, malformed, or absent', () => {
  assert.equal(parseUpdateCheck({ updateAvailable: false, latest: null, currentVersion: '1.2.0' }), null)
  assert.equal(parseUpdateCheck({ updateAvailable: true, latest: { version: 1, channel: 'stable', url: 'x' } }), null)
  assert.equal(parseUpdateCheck(null), null)
  assert.equal(parseUpdateCheck(undefined), null)
})

test('displayVersion prefixes a bare version with v and leaves an already-prefixed one alone', () => {
  assert.equal(displayVersion('1.2.3'), 'v1.2.3')
  assert.equal(displayVersion('v1.2.3'), 'v1.2.3')
})
