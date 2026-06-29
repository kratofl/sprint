import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DashPage, DashWidgetStack, DashWidgetStackLayer } from '@/lib/dash'
import {
  mapWidgetStack,
  mapLayer,
  setLayerWidgets,
  appendLayer,
  insertLayerAfter,
  renameLayer,
  removeLayer,
  moveLayer,
  setDefaultLayer,
} from './multiFunctionWidgetState.ts'

const layer = (id: string, name = id): DashWidgetStackLayer =>
  ({ id, name, widgets: [] }) as unknown as DashWidgetStackLayer
const stack = (id: string, layers: DashWidgetStackLayer[], defaultLayerId?: string): DashWidgetStack =>
  ({ id, name: id, col: 0, row: 0, colSpan: 6, rowSpan: 4, defaultLayerId, layers }) as unknown as DashWidgetStack
const page = (stacks: DashWidgetStack[] | undefined): DashPage =>
  ({ id: 'p1', name: 'P', widgets: [], widgetStacks: stacks }) as unknown as DashPage

test('mapWidgetStack: transforms only the matching stack and is immutable', () => {
  const a = stack('a', [layer('a1')])
  const b = stack('b', [layer('b1')])
  const p = page([a, b])
  const next = mapWidgetStack(p, 'b', s => setDefaultLayer(s, 'b1'))
  assert.equal(next.widgetStacks![0], a) // untouched stack keeps identity
  assert.notEqual(next.widgetStacks![1], b)
  assert.equal(next.widgetStacks![1].defaultLayerId, 'b1')
  assert.notEqual(next, p)
})

test('mapWidgetStack: tolerates a nullish widgetStacks (Wails nil slice)', () => {
  const next = mapWidgetStack(page(undefined), 'x', s => s)
  assert.deepEqual(next.widgetStacks, [])
})

test('mapLayer: transforms only the matching layer', () => {
  const s = stack('a', [layer('l1'), layer('l2')])
  const next = mapLayer(s, 'l2', l => ({ ...l, name: 'renamed' }))
  assert.equal(next.layers[0].name, 'l1')
  assert.equal(next.layers[1].name, 'renamed')
})

test('setLayerWidgets replaces the widget array on one layer', () => {
  const s = stack('a', [layer('l1')])
  const next = setLayerWidgets(s, 'l1', [])
  assert.deepEqual(next.layers[0].widgets, [])
})

test('appendLayer: appends and adopts default only when none set', () => {
  const withDefault = appendLayer(stack('a', [layer('l1')], 'l1'), layer('l2'))
  assert.deepEqual(withDefault.layers.map(l => l.id), ['l1', 'l2'])
  assert.equal(withDefault.defaultLayerId, 'l1')

  const withoutDefault = appendLayer(stack('a', []), layer('l1'))
  assert.equal(withoutDefault.defaultLayerId, 'l1')
})

test('insertLayerAfter: inserts directly after the source layer', () => {
  const s = stack('a', [layer('l1'), layer('l2')])
  const next = insertLayerAfter(s, 'l1', layer('dup'))
  assert.deepEqual(next.layers.map(l => l.id), ['l1', 'dup', 'l2'])
})

test('renameLayer renames one layer', () => {
  const next = renameLayer(stack('a', [layer('l1', 'old')]), 'l1', 'new')
  assert.equal(next.layers[0].name, 'new')
})

test('removeLayer: drops the layer and repoints default to first survivor', () => {
  const next = removeLayer(stack('a', [layer('l1'), layer('l2')], 'l1'), 'l1')
  assert.deepEqual(next.layers.map(l => l.id), ['l2'])
  assert.equal(next.defaultLayerId, 'l2')

  const keepsDefault = removeLayer(stack('a', [layer('l1'), layer('l2')], 'l2'), 'l1')
  assert.equal(keepsDefault.defaultLayerId, 'l2')
})

test('moveLayer: moves within bounds, no-op out of range', () => {
  const s = stack('a', [layer('l1'), layer('l2'), layer('l3')])
  assert.deepEqual(moveLayer(s, 'l1', 1).layers.map(l => l.id), ['l2', 'l1', 'l3'])
  assert.deepEqual(moveLayer(s, 'l3', -1).layers.map(l => l.id), ['l1', 'l3', 'l2'])
  assert.equal(moveLayer(s, 'l1', -1), s) // already first → unchanged reference
  assert.equal(moveLayer(s, 'l3', 1), s) // already last → unchanged reference
})

test('setDefaultLayer sets the default layer id', () => {
  assert.equal(setDefaultLayer(stack('a', [layer('l1')]), 'l1').defaultLayerId, 'l1')
})
