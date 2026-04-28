import test from 'node:test'
import assert from 'node:assert/strict'

import {
  consumeCanvasClick,
  createCanvasInteractionState,
  suppressNextCanvasClick,
} from './canvasInteractionState.ts'

test('canvas click guard suppresses the first click after a completed pointer interaction', () => {
  const suppressed = suppressNextCanvasClick(createCanvasInteractionState())
  const firstClick = consumeCanvasClick(suppressed)
  const secondClick = consumeCanvasClick(firstClick.nextState)

  assert.equal(firstClick.shouldSuppressClick, true)
  assert.equal(firstClick.nextState.suppressNextClick, false)
  assert.equal(secondClick.shouldSuppressClick, false)
})

test('canvas click guard keeps suppression sticky until a click consumes it', () => {
  const once = suppressNextCanvasClick(createCanvasInteractionState())
  const twice = suppressNextCanvasClick(once)

  assert.equal(twice.suppressNextClick, true)
})
