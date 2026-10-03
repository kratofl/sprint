import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initialsFor } from './account'

test('initialsFor takes the first letters of the first and last word', () => {
  assert.equal(initialsFor('Luca Achler'), 'LA')
  assert.equal(initialsFor('  anna maria  schmidt '), 'AS')
  assert.equal(initialsFor('Luca'), 'L')
  assert.equal(initialsFor(''), '')
})
