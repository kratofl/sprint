import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  createViewHistory,
  navigateToView,
  goBack,
  goForward,
  primaryNavIds,
  type AppView,
} from './appShell.ts'

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')

test('navigateToView appends new views and truncates forward history after branching', () => {
  const dash = createViewHistory('dashboards')
  const afterDevices = navigateToView(dash, 'devices')
  const afterHelp = navigateToView(afterDevices, 'help')
  const rewound = goBack(afterHelp)
  const branched = navigateToView(rewound, 'settings')

  assert.deepEqual(branched.stack, ['dashboards', 'devices', 'settings'] satisfies AppView[])
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
  assert.equal(secondBack.current, 'home')
  assert.equal(thirdBack.current, 'home')
  assert.equal(thirdBack.canGoBack, false)
  assert.equal(firstForward.current, 'devices')
  assert.equal(secondForward.current, 'help')
  assert.equal(thirdForward.current, 'help')
  assert.equal(thirdForward.canGoForward, false)
})

test('navigateToView ignores duplicate consecutive view selections', () => {
  const history = navigateToView(createViewHistory('dashboards'), 'dashboards')

  assert.deepEqual(history.stack, ['dashboards'] satisfies AppView[])
  assert.equal(history.index, 0)
  assert.equal(history.canGoBack, false)
  assert.equal(history.canGoForward, false)
})

test('default landing and primary nav ids follow the Apple Graphite application frame', () => {
  assert.equal(createViewHistory().current, 'home')
  assert.deepEqual(primaryNavIds, ['home', 'devices', 'dashboards', 'settings', 'help'] satisfies AppView[])
})

test('desktop IA exposes Home, grouped Devices, Dashboards, and footer utilities', () => {
  assert.match(appSource, /const NAV_SECTIONS: NavRailSection\[\] = \[/)
  assert.match(appSource, /id:\s*'home'[\s\S]*label:\s*'Home'/)
  assert.match(appSource, /label:\s*'Devices'[\s\S]*id:\s*'devices'[\s\S]*label:\s*'Devices'[\s\S]*id:\s*'dashboards'[\s\S]*label:\s*'Dashboards'/)
  assert.match(appSource, /pinned:\s*'bottom'[\s\S]*id:\s*'settings'[\s\S]*label:\s*'Settings'[\s\S]*id:\s*'help'[\s\S]*label:\s*'Help'/)
  assert.match(appSource, /view === 'dashboards' && dashEditorRef\.current\?\.isDirty/)
  assert.doesNotMatch(appSource, /label:\s*'Dash Editor'/)
})
