import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createViewHistory,
  navigateToView,
  goBack,
  goForward,
  type AppView,
} from './appShell.ts'

test('navigateToView appends new views and truncates forward history after branching', () => {
  const home = createViewHistory('home')
  const afterDevices = navigateToView(home, 'devices')
  const afterControls = navigateToView(afterDevices, 'controls')
  const rewound = goBack(afterControls)
  const branched = navigateToView(rewound, 'settings')

  assert.deepEqual(branched.stack, ['home', 'devices', 'settings'] satisfies AppView[])
  assert.equal(branched.index, 2)
  assert.equal(branched.current, 'settings')
})

test('goBack and goForward stop at the history boundaries', () => {
  const history = navigateToView(
    navigateToView(createViewHistory('home'), 'devices'),
    'help',
  )

  const firstBack = goBack(history)
  const secondBack = goBack(firstBack)
  const thirdBack = goBack(secondBack)
  const firstForward = goForward(thirdBack)
  const secondForward = goForward(firstForward)
  const thirdForward = goForward(secondForward)

  assert.equal(firstBack.current, 'devices')
  assert.equal(secondBack.current, 'home')
  assert.equal(thirdBack.current, 'home')
  assert.equal(thirdBack.canGoBack, false)
  assert.equal(firstForward.current, 'devices')
  assert.equal(secondForward.current, 'help')
  assert.equal(thirdForward.current, 'help')
  assert.equal(thirdForward.canGoForward, false)
})

test('navigateToView ignores duplicate consecutive view selections', () => {
  const history = navigateToView(createViewHistory('home'), 'home')

  assert.deepEqual(history.stack, ['home'] satisfies AppView[])
  assert.equal(history.index, 0)
  assert.equal(history.canGoBack, false)
  assert.equal(history.canGoForward, false)
})
