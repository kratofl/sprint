import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameFolder } from '../bridge'
import { canLeaveGame, driverNameProblem, firstRunSteps, raceNumberProblem, timelineStops } from './flow'

const lmu: GameFolder = { folder: 'C:\\Games\\Le Mans Ultimate', chosen: false, found: true, setupCount: 3, resultsCount: 9 }

test('the steps drop Game and Your laps where Sprint cannot read the game', () => {
  assert.deepEqual(firstRunSteps(lmu, true), ['you', 'game', 'laps', 'done'])
  assert.deepEqual(firstRunSteps(lmu, false), ['you', 'game', 'done'])
  assert.deepEqual(firstRunSteps(null, true), ['you', 'done'])
})

test('a driver name must be a real one, not blank or the default', () => {
  assert.notEqual(driverNameProblem('   '), null)
  assert.notEqual(driverNameProblem(' Your name '), null)
  assert.equal(driverNameProblem('Ada Lovelace'), null)
})

test('a race number is one to three digits', () => {
  assert.equal(raceNumberProblem(' 7 '), null)
  assert.equal(raceNumberProblem('222'), null)
  assert.notEqual(raceNumberProblem(''), null)
  assert.notEqual(raceNumberProblem('2222'), null)
  assert.notEqual(raceNumberProblem('A1'), null)
})

test('the Game step waits for a real install', () => {
  assert.equal(canLeaveGame(lmu), true)
  assert.equal(canLeaveGame({ ...lmu, found: false }), false)
  assert.equal(canLeaveGame(null), true)
})

test('timeline stops run from the start line to the flag', () => {
  assert.deepEqual(timelineStops(4), [0, 1 / 3, 2 / 3, 1])
  assert.deepEqual(timelineStops(2), [0, 1])
})
