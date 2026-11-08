import assert from 'node:assert/strict'
import { test } from 'node:test'
import { drawnWidgets, pageTree, type DashLayout, type DashPage, type DashWidget, type DashWidgetGroup } from '@sprint/dashboard'
import {
  addTarget,
  arrangedLayers,
  clickTarget,
  deleteNodes,
  duplicateNodes,
  groupNodes,
  moveNode,
  setGroupMode,
  setNodeRect,
  translateNodes,
  ungroup,
} from './groupOps'

const widget = (id: string, col: number, row: number, group?: string): DashWidget => ({ id, type: 'text', col, row, colSpan: 2, rowSpan: 2, ...(group ? { group } : {}) })

// The mockup's page in small: a top bar group, a loose widget, and a stack whose two layers
// (Timing, Tyres) sit on the same cells.
const groups: DashWidgetGroup[] = [
  { id: 'top', name: 'Top bar', mode: 'together' },
  { id: 'right', name: 'Right column', mode: 'oneAtATime', shownFirst: 'timing' },
  { id: 'timing', name: 'Timing', mode: 'together', parent: 'right' },
  { id: 'tyres', name: 'Tyres', mode: 'together', parent: 'right' },
]
const page: DashPage = {
  id: 'p',
  name: 'Driving',
  widgets: [widget('tc', 0, 0, 'top'), widget('abs', 2, 0, 'top'), widget('delta', 0, 4), widget('sectors', 10, 4, 'timing'), widget('temps', 10, 4, 'tyres')],
  groups,
}
const dash: DashLayout = { id: 'd', name: 'Dash', mode: 'basic', gridCols: 20, gridRows: 12, pages: [page], alerts: [] }

const pageOf = (layout: DashLayout | null | undefined): DashPage => {
  const found = layout?.pages[0]
  assert.ok(found, 'the edit was refused')
  return found
}
const groupOf = (layout: DashLayout | null | undefined, id: string): DashWidgetGroup | undefined => pageOf(layout).groups?.find((item) => item.id === id)

test('grouping puts the selection in a new group where its first item was, and ungrouping undoes it', () => {
  const grouped = groupNodes(dash, 'p', ['delta', 'top'])
  assert.ok(grouped)
  const tree = pageTree(pageOf(grouped.layout))
  assert.equal(tree[0]?.id, grouped.groupId)
  assert.deepEqual(tree[0]?.kind === 'group' ? tree[0].children.map((child) => child.id) : [], ['top', 'delta'])

  const back = ungroup(grouped.layout, 'p', grouped.groupId)
  assert.deepEqual(pageTree(pageOf(back)).map((node) => node.id), ['top', 'delta', 'right'])
})

test('edits that would leave layers of a stack overlapping are refused', () => {
  assert.equal(ungroup(dash, 'p', 'right'), null, 'its layers would share cells on the page')
  assert.equal(setGroupMode(dash, 'p', 'right', 'together'), null)
  assert.equal(moveNode(dash, 'p', 'tyres', null, null), null, 'a layer taken out of its stack')
  assert.equal(groupNodes(dash, 'p', ['timing', 'tyres']), null, 'two layers merged into one')
  assert.equal(moveNode(dash, 'p', 'right', 'timing', null), null, 'a group inside itself')
  // Moving a widget into a group is fine.
  assert.equal(pageOf(moveNode(dash, 'p', 'delta', 'top', null)).widgets.find((item) => item.id === 'delta')?.group, 'top')
})

test('a stack moves with all its layers, and a resized group scales its widgets', () => {
  const moved = pageOf(translateNodes(dash, 'p', ['right'], -2, 1))
  assert.deepEqual(
    moved.widgets.filter((item) => item.group === 'timing' || item.group === 'tyres').map((item) => [item.col, item.row]),
    [[8, 5], [8, 5]],
  )
  assert.equal(translateNodes(dash, 'p', ['top'], 0, 4), null, 'onto the delta widget')

  const scaled = pageOf(setNodeRect(dash, 'p', 'top', { col: 0, row: 0, colSpan: 8, rowSpan: 2 }))
  assert.deepEqual(scaled.widgets.filter((item) => item.group === 'top').map((item) => [item.col, item.colSpan]), [[0, 4], [4, 4]])
})

test('a copy gets fresh ids, keeps which layer its stack shows, and lands in free space', () => {
  const copied = duplicateNodes(dash, 'p', ['right'])
  assert.ok(copied)
  const [copyId] = copied.ids
  assert.ok(copyId && copyId !== 'right')
  const copy = groupOf(copied.layout, copyId)
  assert.equal(copy?.mode, 'oneAtATime')
  assert.equal(groupOf(copied.layout, copy?.shownFirst ?? '')?.name, 'Timing 2')
  assert.equal(pageOf(copied.layout).widgets.length, 7)
})

test('deleting a group deletes everything in it and its stack forgets it as shown first', () => {
  const after = deleteNodes(dash, 'p', ['timing'])
  assert.deepEqual(pageOf(after).widgets.map((item) => item.id), ['tc', 'abs', 'delta', 'temps'])
  assert.equal(groupOf(after, 'right')?.shownFirst, undefined)
  assert.deepEqual(drawnWidgets(pageOf(after)).map((item) => item.id), ['tc', 'abs', 'delta', 'temps'])
})

test('a click selects the outermost group, then the next level down once inside it', () => {
  const tree = pageTree(page)
  assert.equal(clickTarget(tree, 'tc', []), 'top')
  assert.equal(clickTarget(tree, 'abs', ['tc']), 'abs')
  assert.equal(clickTarget(tree, 'sectors', ['right']), 'right', 'a selected group stays selected, so it can be dragged')
  assert.equal(clickTarget(tree, 'sectors', ['tyres']), 'timing')
  assert.equal(clickTarget(tree, 'delta', ['tc']), 'delta')
})

test('the designer arranges the layer holding the selection, else the picked one; new widgets go into it', () => {
  const tree = pageTree(page)
  assert.equal(arrangedLayers(tree, [], new Map()).get('right'), 'timing')
  assert.equal(arrangedLayers(tree, [], new Map([['right', 'tyres']])).get('right'), 'tyres')
  assert.equal(arrangedLayers(tree, ['temps'], new Map([['right', 'timing']])).get('right'), 'tyres')

  const shown = arrangedLayers(tree, ['right'], new Map([['right', 'tyres']]))
  assert.deepEqual(addTarget(tree, ['right'], shown), { group: 'tyres', within: { col: 10, row: 4, colSpan: 2, rowSpan: 2 } })
  assert.deepEqual(addTarget(tree, [], shown), { group: null })
})
