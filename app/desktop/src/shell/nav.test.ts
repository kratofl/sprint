import assert from 'node:assert/strict'
import { test } from 'node:test'
import { areaOf, crumbsFor, footerAreas, footerNav, hasExplorer, primaryAreas, primaryNav } from './nav'

test('every page belongs to exactly one area of the rail', () => {
  const pages = [...primaryNav, ...footerNav].map((item) => item.view)
  const inAreas = [...primaryAreas, ...footerAreas].flatMap((area) => area.views)
  assert.deepEqual([...inAreas].sort(), [...pages].sort())
  for (const view of pages) assert.ok(areaOf(view).views.includes(view), view)
})

test('the toolbar names the area before a page that shares it, and a lone page by itself', () => {
  assert.deepEqual(crumbsFor('Analysis'), ['Drive', 'Analysis'])
  assert.deepEqual(crumbsFor('SessionPlanner'), ['Drive', 'Planner'])
  assert.deepEqual(crumbsFor('Devices'), ['Car & rig', 'Devices'])
  assert.deepEqual(crumbsFor('Home'), ['Overview'])
  assert.deepEqual(crumbsFor('RaceEngineer'), ['Race engineer'])
  assert.deepEqual(crumbsFor('Help'), ['Help & diagnostics'])
})

test('every page in an area of several has an explorer, so its tabs always have a place', () => {
  for (const area of [...primaryAreas, ...footerAreas]) {
    if (area.views.length < 2) continue
    for (const view of area.views) assert.ok(hasExplorer(view), view)
  }
  assert.equal(hasExplorer('Home'), false)
  assert.equal(hasExplorer('RaceEngineer'), false)
  assert.equal(hasExplorer('Settings'), true)
})
