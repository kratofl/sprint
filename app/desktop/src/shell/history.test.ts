import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canGoBack, goBack, initialHistory, navigateTo } from './history'

test('navigating remembers the previous page and back returns to it', () => {
  const visited = navigateTo(navigateTo(initialHistory('Home'), 'Devices'), 'Dashes')
  assert.equal(visited.view, 'Dashes')
  assert.equal(canGoBack(visited), true)

  const once = goBack(visited)
  assert.equal(once.view, 'Devices')
  const twice = goBack(once)
  assert.equal(twice.view, 'Home')
  assert.equal(canGoBack(twice), false)
})

test('re-selecting the current page does not add a back entry', () => {
  const history = navigateTo(initialHistory('Home'), 'Home')
  assert.equal(canGoBack(history), false)
})

test('back with no history leaves the page unchanged', () => {
  const history = initialHistory('Settings')
  assert.equal(goBack(history), history)
})

test('the back stack is bounded', () => {
  let history = initialHistory('Home')
  for (let index = 0; index < 120; index += 1) history = navigateTo(history, index % 2 === 0 ? 'Devices' : 'Dashes')
  assert.equal(history.back.length, 50)
})
