import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canRedo, canUndo, record, redo, replacePresent, startHistory, undo } from './history'

test('undo and redo walk the steps, and a new edit drops the redo', () => {
  let history = record(record(startHistory('a'), 'b'), 'c')
  history = undo(history)
  assert.equal(history.present, 'b')
  assert.ok(canRedo(history))
  history = redo(history)
  assert.equal(history.present, 'c')
  history = record(undo(history), 'd')
  assert.equal(history.present, 'd')
  assert.equal(canRedo(history), false)
  assert.deepEqual(history.past, ['a', 'b'])
})

test('undo and redo at either end change nothing', () => {
  const history = startHistory('a')
  assert.equal(canUndo(history), false)
  assert.equal(undo(history), history)
  assert.equal(redo(history), history)
})

test('edits in one group are one step, and undo or another edit ends the group', () => {
  let history = startHistory(0)
  history = record(history, 1, 'nudge:tc')
  history = record(history, 2, 'nudge:tc')
  history = record(history, 3, 'nudge:tc')
  assert.deepEqual(history.past, [0])
  assert.equal(undo(history).present, 0)

  history = record(history, 4, 'nudge:abs')
  assert.deepEqual(history.past, [0, 3], 'another group is another step')
  history = record(history, 5)
  history = record(history, 6)
  assert.deepEqual(history.past, [0, 3, 4, 5], 'ungrouped edits never coalesce')

  const afterUndo = record(undo(record(history, 7, 'g')), 8, 'g')
  assert.deepEqual(afterUndo.past, [0, 3, 4, 5, 6], 'undo ends the burst')
})

test('history keeps only the newest steps', () => {
  let history = startHistory(0)
  for (let step = 1; step <= 5; step++) history = record(history, step, null, 3)
  assert.deepEqual(history.past, [2, 3, 4])
  assert.equal(history.present, 5)
})

test('replacing the present adds no step', () => {
  const history = replacePresent(record(startHistory('a'), 'b'), 'B')
  assert.deepEqual(history.past, ['a'])
  assert.equal(history.present, 'B')
})
