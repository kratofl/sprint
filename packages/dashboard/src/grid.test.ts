import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alertPanelRect,
  contentRect,
  gridRect,
  pageHasRaceLogicLapTimer,
  raceLogicPanelBounds,
  selectLayer,
  selectPage,
  subRect,
  usesInstrumentFrame,
} from './grid'
import type { DashLayout, DashPage, DashWidget, DashWidgetStack } from './index'

function widget(overrides: Partial<DashWidget> = {}): DashWidget {
  return { id: 'w1', type: 'text', col: 0, row: 0, colSpan: 1, rowSpan: 1, ...overrides }
}

function page(overrides: Partial<DashPage> = {}): DashPage {
  return { id: 'p1', name: 'Page 1', widgets: [], ...overrides }
}

function layout(overrides: Partial<DashLayout> = {}): DashLayout {
  return { id: 'l1', name: 'Layout', default: true, mode: 'basic', gridCols: 20, gridRows: 12, pages: [], alerts: [], ...overrides }
}

test('gridRect divides the canvas evenly for a widget spanning the whole grid', () => {
  const rect = gridRect(800, 480, 20, 12, widget({ col: 0, row: 0, colSpan: 20, rowSpan: 12 }))
  assert.deepEqual(rect, { left: 0, top: 0, width: 800, height: 480 })
})

test('gridRect places a widget at its column/row offset with the expected size', () => {
  // 20 cols over 800px = 40px/col; widget at col 5, spanning 4 cols -> [200, 360).
  const rect = gridRect(800, 480, 20, 12, widget({ col: 5, row: 0, colSpan: 4, rowSpan: 1 }))
  assert.equal(rect.left, 200)
  assert.equal(rect.width, 160)
})

test('gridRect never emits a negative or inverted span, even for a zero-span widget', () => {
  const rect = gridRect(800, 480, 20, 12, widget({ col: 19, row: 11, colSpan: 0, rowSpan: 0 }))
  assert.ok(rect.width >= 1)
  assert.ok(rect.height >= 1)
  assert.ok(rect.left + rect.width <= 800)
  assert.ok(rect.top + rect.height <= 480)
})

test('subRect maps a widget stack layer widget into pixels inside the stack rect', () => {
  const outer = { left: 100, top: 50, width: 400, height: 200 }
  // A 2x2 sub-grid inside the stack; the widget at (1,0) spanning 1x1 should be the right half, top row.
  const rect = subRect(outer, 2, 2, widget({ col: 1, row: 0, colSpan: 1, rowSpan: 1 }))
  assert.deepEqual(rect, { left: 300, top: 50, width: 200, height: 100 })
})

test('contentRect insets header/rpm_bar less than other instrument widgets', () => {
  const rect = { left: 0, top: 0, width: 200, height: 100 }
  assert.equal(contentRect(rect, 'header').left, 2)
  assert.equal(contentRect(rect, 'fuel').left, 6)
})

test('contentRect caps the inset to 8% of the smaller dimension for tiny widgets', () => {
  const rect = { left: 0, top: 0, width: 20, height: 20 }
  // min(6, 20*0.08) = 1.6
  assert.equal(contentRect(rect, 'fuel').left, 1.6)
})

test('usesInstrumentFrame lists exactly the widget types the desktop painter frames by default', () => {
  for (const type of ['gear_speed', 'input_trace', 'sector', 'lap_time', 'fuel', 'tyre_temp', 'tyre_pressure', 'gaps']) {
    assert.equal(usesInstrumentFrame(type), true, type)
  }
  for (const type of ['header', 'rpm_bar', 'text', 'delta', 'flag']) {
    assert.equal(usesInstrumentFrame(type), false, type)
  }
})

test('selectPage prefers the idle page when idle is requested, falling back to the first page', () => {
  const idlePage = page({ id: 'idle' })
  const firstPage = page({ id: 'p1' })
  assert.equal(selectPage(layout({ idlePage, pages: [firstPage] }), undefined, true), idlePage)
  assert.equal(selectPage(layout({ pages: [firstPage] }), undefined, true), firstPage)
})

test('selectPage matches an explicit pageId case-insensitively, else falls back to the first page', () => {
  const target = page({ id: 'Race' })
  const first = page({ id: 'Overview' })
  assert.equal(selectPage(layout({ pages: [first, target] }), 'race', false), target)
  assert.equal(selectPage(layout({ pages: [first, target] }), 'not-a-page', false), first)
})

test('selectLayer honors defaultLayerId when it matches, else falls back to the first layer', () => {
  const stack: DashWidgetStack = {
    id: 's1', name: 'Stack', col: 0, row: 0, colSpan: 4, rowSpan: 4, defaultLayerId: 'b',
    layers: [{ id: 'a', name: 'A', widgets: [] }, { id: 'b', name: 'B', widgets: [] }],
  }
  assert.equal(selectLayer(stack)?.id, 'b')
  assert.equal(selectLayer({ ...stack, defaultLayerId: 'missing' })?.id, 'a')
})

test('pageHasRaceLogicLapTimer finds the widget at the top level and inside a stack layer', () => {
  assert.equal(pageHasRaceLogicLapTimer(null), false)
  assert.equal(pageHasRaceLogicLapTimer(page({ widgets: [widget({ type: 'racelogic_lap_timer' })] })), true)
  const stack: DashWidgetStack = { id: 's1', name: 'Stack', col: 0, row: 0, colSpan: 4, rowSpan: 4, layers: [{ id: 'a', name: 'A', widgets: [widget({ type: 'racelogic_lap_timer' })] }] }
  assert.equal(pageHasRaceLogicLapTimer(page({ widgetStacks: [stack] })), true)
  assert.equal(pageHasRaceLogicLapTimer(page({ widgets: [widget({ type: 'fuel' })] })), false)
})

test('raceLogicPanelBounds is always exactly 4:1 and centered on the canvas', () => {
  const bounds = raceLogicPanelBounds(800, 480)
  assert.equal(bounds.width / bounds.height, 4)
  assert.equal(bounds.left, (800 - bounds.width) / 2)
  assert.equal(bounds.top, (480 - bounds.height) / 2)
})

test('alertPanelRect insets the raw grid rect by 2px on each side without the clamp/normalize pass', () => {
  const rect = alertPanelRect(800, 480, { col: 6, row: 3, colSpan: 8, rowSpan: 6, gridCols: 20, gridRows: 12 })
  // col 6..14 over 20 cols of 800px = 40px/col -> [240, 560); inset by 2px each side.
  assert.equal(rect.left, 242)
  assert.equal(rect.width, 560 - 240 - 4)
})
