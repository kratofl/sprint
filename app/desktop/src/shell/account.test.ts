import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accountName, initialsFor } from './account'

test('initialsFor takes the first letters of the first and last word', () => {
  assert.equal(initialsFor('Alex Morgan'), 'AM')
  assert.equal(initialsFor('  anna maria  schmidt '), 'AS')
  assert.equal(initialsFor('Alex'), 'A')
  assert.equal(initialsFor(''), '')
})

test('accountName is the display name, or the email until one is set', () => {
  const account = { signedIn: true, serverUrl: 'http://localhost:8080', email: 'ada@sprint.gg' } as const
  assert.equal(accountName({ ...account, displayName: 'Ada Lovelace' }), 'Ada Lovelace')
  assert.equal(accountName({ ...account, displayName: '  ' }), 'ada@sprint.gg')
})
