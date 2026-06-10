import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createViewHistory,
  navigateToView,
  goBack,
  goForward,
  primaryNavIds,
  type AppView,
} from './appShell.ts'

test('navigateToView appends new views and truncates forward history after branching', () => {
  const dash = createViewHistory()
  const afterDevices = navigateToView(dash, 'devices')
  const afterControls = navigateToView(afterDevices, 'controls')
  const rewound = goBack(afterControls)
  const branched = navigateToView(rewound, 'settings')

  assert.deepEqual(branched.stack, ['dash', 'devices', 'settings'] satisfies AppView[])
  assert.equal(branched.index, 2)
  assert.equal(branched.current, 'settings')
})

test('goBack and goForward stop at the history boundaries', () => {
  const history = navigateToView(
    navigateToView(createViewHistory(), 'devices'),
    'help',
  )

  const firstBack = goBack(history)
  const secondBack = goBack(firstBack)
  const thirdBack = goBack(secondBack)
  const firstForward = goForward(thirdBack)
  const secondForward = goForward(firstForward)
  const thirdForward = goForward(secondForward)

  assert.equal(firstBack.current, 'devices')
  assert.equal(secondBack.current, 'dash')
  assert.equal(thirdBack.current, 'dash')
  assert.equal(thirdBack.canGoBack, false)
  assert.equal(firstForward.current, 'devices')
  assert.equal(secondForward.current, 'help')
  assert.equal(thirdForward.current, 'help')
  assert.equal(thirdForward.canGoForward, false)
})

test('navigateToView ignores duplicate consecutive view selections', () => {
  const history = navigateToView(createViewHistory(), 'dash')

  assert.deepEqual(history.stack, ['dash'] satisfies AppView[])
  assert.equal(history.index, 0)
  assert.equal(history.canGoBack, false)
  assert.equal(history.canGoForward, false)
})

test('default landing and primary nav ids follow the Figma application frame', () => {
  assert.equal(createViewHistory().current, 'dash')
  assert.deepEqual(primaryNavIds, ['telemetry', 'dash', 'devices', 'settings', 'help'] satisfies AppView[])
})
