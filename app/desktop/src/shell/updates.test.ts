import assert from 'node:assert/strict'
import { test } from 'node:test'
import { displayVersion, parseUpdateStatus } from './updates'

test('the update status is narrowed once, and anything malformed reads as a failure', () => {
  assert.deepEqual(parseUpdateStatus({ kind: 'downloading', version: '1.2.0', percent: 40 }), { kind: 'downloading', version: '1.2.0', percent: 40 })
  assert.deepEqual(parseUpdateStatus({ kind: 'ready', version: '1.2.0' }), { kind: 'ready', version: '1.2.0' })
  assert.deepEqual(parseUpdateStatus({ kind: 'up-to-date' }), { kind: 'up-to-date' })
  assert.equal(parseUpdateStatus({ kind: 'ready' }).kind, 'failed')
  assert.equal(parseUpdateStatus({ kind: 'nope' }).kind, 'failed')
  assert.equal(parseUpdateStatus(null).kind, 'failed')
})

test('displayVersion prefixes a bare version with v and leaves an already-prefixed one alone', () => {
  assert.equal(displayVersion('1.2.3'), 'v1.2.3')
  assert.equal(displayVersion('v1.2.3'), 'v1.2.3')
})
