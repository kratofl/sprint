import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alertPanelRect,
  gridRect,
  pageHasRaceLogicLapTimer,
  raceLogicPanelBounds,
  selectPage,
} from './grid'
import type { DashLayout, DashPage, DashWidget } from './index'

function widget(overrides: Partial<DashWidget> = {}): DashWidget {
  return { id: 'w1', type: 'text', col: 0, row: 0, colSpan: 1, rowSpan: 1, ...overrides }
}

function page(overrides: Partial<DashPage> = {}): DashPage {
  return { id: 'p1', name: 'Page 1', widgets: [], ...overrides }
}

function layout(overrides: Partial<DashLayout> = {}): DashLayout {
  return { id: 'l1', name: 'Layout', mode: 'basic', gridCols: 20, gridRows: 12, pages: [], alerts: [], ...overrides }
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

test('pageHasRaceLogicLapTimer counts the lap timer only where it is drawn', () => {
  const timer = widget({ id: 't', type: 'racelogic_lap_timer', group: 'stack' })
  const fuel = widget({ id: 'f', type: 'fuel', group: 'stack' })
  const groups: DashPage['groups'] = [{ id: 'stack', name: 'Stack', mode: 'oneAtATime' }]
  assert.equal(pageHasRaceLogicLapTimer(null), false)
  assert.equal(pageHasRaceLogicLapTimer(page({ widgets: [widget({ type: 'racelogic_lap_timer' })] })), true)
  assert.equal(pageHasRaceLogicLapTimer(page({ widgets: [timer, fuel], groups })), true)
  assert.equal(pageHasRaceLogicLapTimer(page({ widgets: [fuel, timer], groups })), false, 'a layer the stack does not show')
  assert.equal(pageHasRaceLogicLapTimer(page({ widgets: [widget({ type: 'racelogic_lap_timer', hidden: true })] })), false)
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
