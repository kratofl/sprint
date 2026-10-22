import test from 'node:test'
import assert from 'node:assert/strict'
import { confirmPasswordError, displayNameError, instanceNameError, newPasswordError, saveOutcome } from './settings.ts'

test('a display name needs 1–40 characters after trimming', () => {
  assert.equal(displayNameError('Alex Morgan'), null)
  assert.equal(displayNameError('   '), 'Enter a display name.')
  assert.equal(displayNameError('x'.repeat(41)), 'Use 40 characters or fewer.')
  assert.equal(displayNameError(` ${'x'.repeat(40)} `), null)
})

test('a new password needs 8 characters and a matching confirmation', () => {
  assert.equal(newPasswordError('hunter2'), 'Use at least 8 characters.')
  assert.equal(newPasswordError('hunter22'), null)
  assert.equal(confirmPasswordError('hunter22', 'hunter23'), 'The passwords don’t match.')
  assert.equal(confirmPasswordError('hunter22', 'hunter22'), null)
})

test('a server name needs 1–60 characters after trimming', () => {
  assert.equal(instanceNameError('Nordwind Racing'), null)
  assert.equal(instanceNameError(''), 'Enter a name for this server.')
  assert.equal(instanceNameError('x'.repeat(61)), 'Use 60 characters or fewer.')
})

test('a mutation result becomes saved, a shown error, or a signed-out session', () => {
  const now = Date.parse('2026-10-06T12:00:00Z')

  assert.deepEqual(saveOutcome({ kind: 'data', data: { changePassword: true } }, now), { kind: 'saved', at: now })
  assert.deepEqual(saveOutcome({ kind: 'error', message: 'Current password is incorrect.' }, now), {
    kind: 'failed',
    message: 'Current password is incorrect.',
  })
  assert.deepEqual(saveOutcome({ kind: 'network' }, now), {
    kind: 'failed',
    message: 'Can’t reach the Sprint API. Try again in a moment.',
  })
  assert.deepEqual(saveOutcome({ kind: 'unauthenticated' }, now), { kind: 'signed-out' })
})
