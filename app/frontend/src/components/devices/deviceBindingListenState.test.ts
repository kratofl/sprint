import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buttonNumberFromKeyboardKey,
  cancelDeviceBindingListen,
  reduceDeviceBindingKey,
  startDeviceBindingListen,
} from './deviceBindingListenState.ts'

test('buttonNumberFromKeyboardKey maps number keys to persisted button numbers', () => {
  assert.equal(buttonNumberFromKeyboardKey('1'), 1)
  assert.equal(buttonNumberFromKeyboardKey('9'), 9)
  assert.equal(buttonNumberFromKeyboardKey('0'), 10)
})

test('buttonNumberFromKeyboardKey ignores non-number keys', () => {
  assert.equal(buttonNumberFromKeyboardKey('a'), null)
  assert.equal(buttonNumberFromKeyboardKey('Escape'), null)
  assert.equal(buttonNumberFromKeyboardKey('F1'), null)
})

test('start and cancel update the active listening command id', () => {
  const started = startDeviceBindingListen({ listeningCommandId: null }, 'dash.page.next')
  assert.deepEqual(started, { listeningCommandId: 'dash.page.next' })
  assert.deepEqual(cancelDeviceBindingListen(started), { listeningCommandId: null })
})

test('reduceDeviceBindingKey assigns number keys and clears listen state', () => {
  const result = reduceDeviceBindingKey({ listeningCommandId: 'dash.page.next' }, '0')

  assert.deepEqual(result.state, { listeningCommandId: null })
  assert.deepEqual(result.assignment, { commandId: 'dash.page.next', button: 10 })
})

test('reduceDeviceBindingKey cancels on Escape and ignores unrelated keys', () => {
  assert.deepEqual(
    reduceDeviceBindingKey({ listeningCommandId: 'dash.page.next' }, 'Escape'),
    { state: { listeningCommandId: null }, assignment: null },
  )

  assert.deepEqual(
    reduceDeviceBindingKey({ listeningCommandId: 'dash.page.next' }, 'Shift'),
    { state: { listeningCommandId: 'dash.page.next' }, assignment: null },
  )
})
