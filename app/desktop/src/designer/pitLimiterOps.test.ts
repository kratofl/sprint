import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashLayout } from '@sprint/dashboard'
import { addWidgetAt } from '../views/DashesDomain'
import { deleteNodes } from './groupOps'
import { PIT_LIMITER_PAGE_ID, clearPitLimiterWidgets, onPitLimiter, setPitLimiterStyle } from './pitLimiterOps'

const gear = { id: 'gear', type: 'gear', col: 4, row: 1, colSpan: 2, rowSpan: 3 }
const page = { id: 'race', name: 'Race', widgets: [{ id: 'tc', type: 'tc', col: 1, row: 1, colSpan: 2, rowSpan: 1 }, gear] }
const dash = (style: 'gear' | 'box'): DashLayout => ({ id: 'd', name: 'D', mode: 'basic', gridCols: 10, gridRows: 9, colSizes: [40, 90, 90, 90, 90, 90, 90, 90, 90, 40], rowSizes: [36, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5], pages: [page], alerts: [], pitLimiter: { style, widgets: [] } })
const add = (type: string, col: number, row: number) => onPitLimiter((view) => addWidgetAt(view, PIT_LIMITER_PAGE_ID, type, col, row)?.layout ?? null, gear)

test("the Layout tools edit the pit limiter's own widgets and never the page under it", () => {
  const added = add('speed', 4, 4)(dash('box'))
  assert.deepEqual(added?.pitLimiter, { style: 'box', widgets: [{ id: 'speed', type: 'speed', col: 4, row: 4, colSpan: 2, rowSpan: 1 }] }, 'the stand-ins are not saved')
  assert.deepEqual(added?.pages, [page])
  const removed = added && onPitLimiter((view) => deleteNodes(view, PIT_LIMITER_PAGE_ID, ['speed']), gear)(added)
  assert.deepEqual(removed?.pitLimiter?.widgets, [])
})

test("nothing goes on the page's gear; the box also keeps its frame, the gear style lets widgets in", () => {
  assert.equal(add('speed', 4, 2)(dash('gear')), null, 'the gear')
  assert.equal(add('fuel_bar', 0, 4)(dash('box')), null, 'the first column')
  assert.equal(add('laps', 3, 0)(dash('box')), null, 'the top row')
  assert.deepEqual(add('fuel_bar', 0, 4)(dash('gear'))?.pitLimiter?.widgets.map((widget) => [widget.col, widget.row, widget.colSpan, widget.rowSpan]), [[0, 4, 2, 1]])
})

test('widgets placed in the frame under the gear style stay put, out of the way, once the box covers them', () => {
  const bar = { id: 'bar', type: 'fuel_bar', col: 0, row: 1, colSpan: 1, rowSpan: 8 }
  const boxed: DashLayout = { ...dash('box'), pitLimiter: { style: 'box', widgets: [bar] } }
  assert.deepEqual(add('speed', 4, 4)(boxed)?.pitLimiter?.widgets.map((widget) => widget.id), ['bar', 'speed'], 'the edit goes through and the bar is kept')
  // An edit that takes the kept widget's id gives the kept one a fresh id, never two of one.
  const renamed = add('speed', 4, 4)({ ...boxed, pitLimiter: { style: 'box', widgets: [{ ...bar, id: 'speed' }] } })
  assert.deepEqual(renamed?.pitLimiter?.widgets.map((widget) => widget.id), ['speed-2', 'speed'])
})

test('a style is picked once and the widgets can all go at once', () => {
  assert.equal(setPitLimiterStyle(dash('gear'), 'gear'), null)
  assert.equal(setPitLimiterStyle({ ...dash('gear'), pitLimiter: undefined }, 'gear'), null, 'gear is what a dash without one shows')
  assert.equal(setPitLimiterStyle(dash('gear'), 'full')?.pitLimiter?.style, 'full')
  const one: DashLayout = { ...dash('gear'), pitLimiter: { style: 'gear', widgets: [{ id: 's', type: 'speed', col: 4, row: 4, colSpan: 2, rowSpan: 1 }] } }
  assert.deepEqual(clearPitLimiterWidgets(one)?.pitLimiter, { style: 'gear', widgets: [] })
  assert.equal(clearPitLimiterWidgets(dash('gear')), null)
})
