import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initialsFor } from './account'

test('initialsFor takes the first letters of the first and last word', () => {
  assert.equal(initialsFor('Alex Morgan'), 'AM')
  assert.equal(initialsFor('  anna maria  schmidt '), 'AS')
  assert.equal(initialsFor('Alex'), 'A')
  assert.equal(initialsFor(''), '')
})
