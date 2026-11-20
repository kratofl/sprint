import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashLayout } from '@sprint/dashboard'
import { addWidgetAt } from '../views/DashesDomain'
import { deleteNodes } from './groupOps'
import { PIT_LIMITER_PAGE_ID, clearPitLimiterWidgets, onPitLimiter, setPitLimiterStyle } from './pitLimiterOps'

const page = { id: 'race', name: 'Race', widgets: [{ id: 'tc', type: 'tc', col: 1, row: 1, colSpan: 2, rowSpan: 1 }] }
const dash = (style: 'gear' | 'box'): DashLayout => ({ id: 'd', name: 'D', mode: 'basic', zoned: true, gridCols: 11, gridRows: 9, pages: [page], alerts: [], pitLimiter: { style, widgets: [] } })

test("the Layout tools edit the pit limiter's own widgets and never the page under it", () => {
  const added = onPitLimiter((view) => addWidgetAt(view, PIT_LIMITER_PAGE_ID, 'speed', 5, 4)?.layout ?? null, undefined)(dash('box'))
  assert.deepEqual(added?.pitLimiter, { style: 'box', widgets: [{ id: 'speed', type: 'speed', col: 5, row: 4, colSpan: 1, rowSpan: 1 }] }, 'the box’s stand-ins are not saved')
  assert.deepEqual(added?.pages, [page])
  const removed = added && onPitLimiter((view) => deleteNodes(view, PIT_LIMITER_PAGE_ID, ['speed']), undefined)(added)
  assert.deepEqual(removed?.pitLimiter?.widgets, [])
})

test('the box covers the bar spots; with the gear style they take bars like a page', () => {
  const barLeft = (layout: DashLayout) => onPitLimiter((view) => addWidgetAt(view, PIT_LIMITER_PAGE_ID, 'bar', 0, 4)?.layout ?? null, undefined)(layout)
  assert.equal(barLeft(dash('box')), null)
  assert.deepEqual(barLeft(dash('gear'))?.pitLimiter?.widgets.map((widget) => [widget.col, widget.row, widget.colSpan, widget.rowSpan]), [[0, 0, 1, 9]])
})

test('widgets placed in the bar spots under the gear style stay put, out of the way, once the box covers them', () => {
  const bar = { id: 'bar', type: 'bar', col: 0, row: 0, colSpan: 1, rowSpan: 9 }
  const boxed: DashLayout = { ...dash('box'), pitLimiter: { style: 'box', widgets: [bar] } }
  const added = onPitLimiter((view) => addWidgetAt(view, PIT_LIMITER_PAGE_ID, 'speed', 5, 4)?.layout ?? null, undefined)(boxed)
  assert.deepEqual(added?.pitLimiter?.widgets.map((widget) => widget.id), ['bar', 'speed'], 'the edit goes through and the bar is kept')
  // An edit that takes the kept widget's id gives the kept one a fresh id, never two of one.
  const renamed = onPitLimiter((view) => addWidgetAt(view, PIT_LIMITER_PAGE_ID, 'speed', 5, 4)?.layout ?? null, undefined)({ ...boxed, pitLimiter: { style: 'box', widgets: [{ ...bar, id: 'speed' }] } })
  assert.deepEqual(renamed?.pitLimiter?.widgets.map((widget) => widget.id), ['speed-2', 'speed'])
})

test('a style is picked once and the widgets can all go at once', () => {
  assert.equal(setPitLimiterStyle(dash('gear'), 'gear'), null)
  assert.equal(setPitLimiterStyle({ ...dash('gear'), pitLimiter: undefined }, 'gear'), null, 'gear is what a dash without one shows')
  assert.equal(setPitLimiterStyle(dash('gear'), 'full')?.pitLimiter?.style, 'full')
  const one: DashLayout = { ...dash('gear'), pitLimiter: { style: 'gear', widgets: [{ id: 's', type: 'speed', col: 5, row: 4, colSpan: 1, rowSpan: 1 }] } }
  assert.deepEqual(clearPitLimiterWidgets(one)?.pitLimiter, { style: 'gear', widgets: [] })
  assert.equal(clearPitLimiterWidgets(dash('gear')), null)
})
