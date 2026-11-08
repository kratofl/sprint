import test from 'node:test'
import assert from 'node:assert/strict'
import { drawnWidgets, mayOverlap, pageTree, stackLayers, type DashNode } from './groups'
import type { DashPage, DashWidget } from './index'

const widget = (id: string, group?: string): DashWidget => ({ id, type: 'text', col: 0, row: 0, colSpan: 1, rowSpan: 1, group })

const outline = (nodes: DashNode[]): unknown[] => nodes.map((node) => (node.kind === 'widget' ? node.id : { [node.id]: outline(node.children) }))

test('the tree orders siblings by where their first widget sits; empty groups come last', () => {
  const page: DashPage = {
    id: 'p',
    name: 'P',
    widgets: [widget('a'), widget('b', 'top'), widget('c', 'inner'), widget('d'), widget('e', 'top')],
    groups: [
      { id: 'empty', name: 'Empty', mode: 'together' },
      { id: 'inner', name: 'Inner', mode: 'together', parent: 'top' },
      { id: 'top', name: 'Top', mode: 'together' },
    ],
  }
  assert.deepEqual(outline(pageTree(page)), ['a', { top: ['b', { inner: ['c'] }, 'e'] }, 'd', { empty: [] }])
})

test('a missing or cyclic parent puts the group on the page instead of losing it', () => {
  const page: DashPage = {
    id: 'p',
    name: 'P',
    widgets: [widget('a', 'x'), widget('b', 'lost'), widget('c', 'nowhere')],
    groups: [
      { id: 'x', name: 'X', mode: 'together', parent: 'y' },
      { id: 'y', name: 'Y', mode: 'together', parent: 'x' },
      { id: 'lost', name: 'Lost', mode: 'together', parent: 'gone' },
    ],
  }
  assert.deepEqual(drawnWidgets(page).map((item) => item.id).sort(), ['a', 'b', 'c'])
})

test('a stack draws its shown layer, else its first child, and nothing under a hidden one', () => {
  const page: DashPage = {
    id: 'p',
    name: 'P',
    widgets: [widget('a', 'one'), widget('b', 'two'), widget('c', 'two')],
    groups: [
      { id: 'stack', name: 'Stack', mode: 'oneAtATime', shownFirst: 'two' },
      { id: 'one', name: 'One', mode: 'together', parent: 'stack' },
      { id: 'two', name: 'Two', mode: 'together', parent: 'stack' },
    ],
  }
  const withGroup = (id: string, patch: object): DashPage => ({ ...page, groups: page.groups?.map((group) => (group.id === id ? { ...group, ...patch } : group)) })
  assert.deepEqual(drawnWidgets(page).map((item) => item.id), ['b', 'c'])
  assert.deepEqual(drawnWidgets(withGroup('stack', { shownFirst: 'gone' })).map((item) => item.id), ['a'])
  assert.deepEqual(drawnWidgets(withGroup('stack', { mode: 'together' })).map((item) => item.id), ['a', 'b', 'c'])
  assert.deepEqual(drawnWidgets(withGroup('two', { hidden: true })).map((item) => item.id), [])
})

test('only widgets in different layers of one stack may overlap', () => {
  const page: DashPage = {
    id: 'p',
    name: 'P',
    widgets: [],
    groups: [
      { id: 'stack', name: 'Stack', mode: 'oneAtATime' },
      { id: 'one', name: 'One', mode: 'together', parent: 'stack' },
      { id: 'two', name: 'Two', mode: 'together', parent: 'stack' },
      { id: 'bar', name: 'Bar', mode: 'together' },
    ],
  }
  const layers = (group: string | null, id: string) => stackLayers(page, group, id)
  assert.equal(mayOverlap(layers('one', 'a'), layers('two', 'b')), true)
  assert.equal(mayOverlap(layers('one', 'a'), layers('one', 'b')), false, 'same layer')
  assert.equal(mayOverlap(layers('stack', 'a'), layers('stack', 'b')), true, 'two widgets that are each a layer')
  assert.equal(mayOverlap(layers('one', 'a'), layers(null, 'b')), false, 'outside the stack')
  assert.equal(mayOverlap(layers('bar', 'a'), layers('bar', 'b')), false, 'a together group')
})
