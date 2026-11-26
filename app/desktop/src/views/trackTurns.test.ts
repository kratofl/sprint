import assert from 'node:assert/strict'
import { test } from 'node:test'
import { trackTurns } from './trackTurns'

test('an LMU track’s real turns are found by the name the game records', () => {
  const monza = trackTurns('LeMansUltimate', 'Autodromo Nazionale Monza')
  assert.equal(monza?.find((turn) => turn.number === 3)?.at, 0.24)
  assert.deepEqual(trackTurns('Le Mans Ultimate', 'Circuit de la Sarthe')?.[0], { number: 1, at: 0.05 })
  assert.equal(trackTurns('LeMansUltimate', 'A track the data has not got'), null)
  assert.equal(trackTurns('AnotherGame', 'Autodromo Nazionale Monza'), null)
})
