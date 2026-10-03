import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashLayout, DashPage, DashWidget, DashWidgetStack } from '@sprint/dashboard'
import {
  addWidgetAt,
  applyThemePreset,
  canPlaceNewWidget,
  canPlaceWidgetAt,
  fitScreenSize,
  previewMoveRect,
  previewResizeRect,
  type GridRect,
  type ResizeHandle,
  type WidgetLocation,
} from './DashesDomain'

// ── Test fixtures ────────────────────────────────────────────────────────
// A plain 20x12 page grid, mirroring the default screen profile, with a couple
// of pre-placed widgets to overlap against.

function widget(id: string, col: number, row: number, colSpan: number, rowSpan: number): DashWidget {
  return { id, type: 'text', col, row, colSpan, rowSpan }
}

function layout(page: DashPage, overrides: Partial<DashLayout> = {}): DashLayout {
  return { id: 'dash-1', name: 'Dash', default: false, mode: 'basic', gridCols: 20, gridRows: 12, pages: [page], alerts: [], ...overrides }
}

function pageWithWidgets(...widgets: DashWidget[]): DashPage {
  return { id: 'page-1', name: 'Page 1', widgets }
}

// ── canPlaceNewWidget ────────────────────────────────────────────────────

test('canPlaceNewWidget accepts a free in-bounds rect and rejects an overlapping one', () => {
  const existing = widget('rpm', 0, 0, 20, 1)
  const dash = layout(pageWithWidgets(existing))

  assert.equal(canPlaceNewWidget(dash, 'page-1', { col: 0, row: 1, colSpan: 4, rowSpan: 2 }), true)
  assert.equal(canPlaceNewWidget(dash, 'page-1', { col: 0, row: 0, colSpan: 4, rowSpan: 2 }), false, 'overlaps the RPM bar')
})

test('canPlaceNewWidget rejects a rect that runs off either grid edge', () => {
  const dash = layout(pageWithWidgets())

  assert.equal(canPlaceNewWidget(dash, 'page-1', { col: 18, row: 0, colSpan: 4, rowSpan: 2 }), false, 'colSpan runs past gridCols')
  assert.equal(canPlaceNewWidget(dash, 'page-1', { col: 0, row: 11, colSpan: 4, rowSpan: 2 }), false, 'rowSpan runs past gridRows')
  assert.equal(canPlaceNewWidget(dash, 'page-1', { col: -1, row: 0, colSpan: 4, rowSpan: 2 }), false, 'negative col')
})

test('canPlaceNewWidget returns false for an unknown page', () => {
  const dash = layout(pageWithWidgets())
  assert.equal(canPlaceNewWidget(dash, 'no-such-page', { col: 0, row: 0, colSpan: 4, rowSpan: 2 }), false)
})

// ── addWidgetAt ──────────────────────────────────────────────────────────

test('addWidgetAt places a widget at the requested cell with the default span, without mutating the source layout', () => {
  const dash = layout(pageWithWidgets())
  const result = addWidgetAt(dash, 'page-1', 'text', 2, 3)
  assert.ok(result)
  assert.deepEqual(result.widget, { id: 'text', type: 'text', col: 2, row: 3, colSpan: 4, rowSpan: 2 })
  assert.equal(dash.pages[0].widgets.length, 0, 'the input layout is untouched')
  assert.equal(result.layout.pages[0].widgets.length, 1)
})

test('addWidgetAt clamps the requested cell into bounds instead of rejecting it', () => {
  const dash = layout(pageWithWidgets())
  // Default span is 4x2; requesting the far edge must clamp col/row so the whole widget stays on-grid.
  const result = addWidgetAt(dash, 'page-1', 'text', 19, 11)
  assert.ok(result)
  assert.equal(result.widget.col, 16) // 20 - colSpan(4)
  assert.equal(result.widget.row, 10) // 12 - rowSpan(2)
})

test('addWidgetAt rejects a drop whose (clamped) rect would overlap an existing widget — no silent relocation', () => {
  const dash = layout(pageWithWidgets(widget('rpm', 0, 0, 20, 1)))
  assert.equal(addWidgetAt(dash, 'page-1', 'text', 0, 0), null)
})

test('addWidgetAt returns null for an unknown page', () => {
  const dash = layout(pageWithWidgets())
  assert.equal(addWidgetAt(dash, 'missing', 'text', 0, 0), null)
})

test('addWidgetAt de-duplicates ids against existing widgets on the page', () => {
  const dash = layout(pageWithWidgets(widget('text', 0, 0, 2, 2)))
  const result = addWidgetAt(dash, 'page-1', 'text', 10, 5)
  assert.ok(result)
  assert.equal(result.widget.id, 'text-2')
})

// ── canPlaceWidgetAt ─────────────────────────────────────────────────────

test('canPlaceWidgetAt (page widget) excludes the widget itself from its own overlap check', () => {
  const moving = widget('a', 0, 0, 4, 2)
  const dash = layout(pageWithWidgets(moving, widget('b', 4, 0, 4, 2)))
  const location: WidgetLocation = { kind: 'page', pageId: 'page-1' }

  // Staying put (or moving within free space) is fine.
  assert.equal(canPlaceWidgetAt(dash, location, 'a', { col: 0, row: 0, colSpan: 4, rowSpan: 2 }), true)
  // Moving onto "b" is not.
  assert.equal(canPlaceWidgetAt(dash, location, 'a', { col: 4, row: 0, colSpan: 4, rowSpan: 2 }), false)
})

test('canPlaceWidgetAt (page widget) rejects out-of-bounds rects and unknown widget ids', () => {
  const dash = layout(pageWithWidgets(widget('a', 0, 0, 4, 2)))
  const location: WidgetLocation = { kind: 'page', pageId: 'page-1' }

  assert.equal(canPlaceWidgetAt(dash, location, 'a', { col: 18, row: 0, colSpan: 4, rowSpan: 2 }), false)
  assert.equal(canPlaceWidgetAt(dash, location, 'ghost', { col: 0, row: 0, colSpan: 4, rowSpan: 2 }), false)
})

function pageWithStack(stack: DashWidgetStack): DashPage {
  return { id: 'page-1', name: 'Page 1', widgets: [], widgetStacks: [stack] }
}

test('canPlaceWidgetAt (stack-layer widget) is bounded by the stack\'s own sub-grid, not the page grid', () => {
  const layerWidget = widget('inner', 0, 0, 2, 2)
  const stack: DashWidgetStack = {
    id: 'stack-1',
    name: 'Stack',
    col: 0,
    row: 0,
    colSpan: 6,
    rowSpan: 4,
    defaultLayerId: 'layer-1',
    layers: [{ id: 'layer-1', name: 'Layer 1', widgets: [layerWidget, widget('other', 2, 0, 2, 2)] }],
  }
  const dash = layout(pageWithStack(stack))
  const location: WidgetLocation = { kind: 'stackLayer', pageId: 'page-1', stackId: 'stack-1', layerId: 'layer-1' }

  // Within the stack's 6x4 sub-grid and clear of "other": fine.
  assert.equal(canPlaceWidgetAt(dash, location, 'inner', { col: 4, row: 0, colSpan: 2, rowSpan: 2 }), true)
  // Runs past the stack's own colSpan (6), even though the page itself is 20 wide.
  assert.equal(canPlaceWidgetAt(dash, location, 'inner', { col: 5, row: 0, colSpan: 2, rowSpan: 2 }), false)
  // Overlaps "other" inside the layer.
  assert.equal(canPlaceWidgetAt(dash, location, 'inner', { col: 2, row: 0, colSpan: 2, rowSpan: 2 }), false)
})

// ── previewMoveRect ──────────────────────────────────────────────────────

test('previewMoveRect translates by whole cells and clamps at both grid edges', () => {
  const start: GridRect = { col: 5, row: 5, colSpan: 4, rowSpan: 2 }

  assert.deepEqual(previewMoveRect(start, 2, -1, 20, 12), { col: 7, row: 4, colSpan: 4, rowSpan: 2 })
  // Past the right/bottom edge clamps so col+colSpan and row+rowSpan stay in bounds.
  assert.deepEqual(previewMoveRect(start, 100, 100, 20, 12), { col: 16, row: 10, colSpan: 4, rowSpan: 2 })
  // Past the left/top edge clamps to 0.
  assert.deepEqual(previewMoveRect(start, -100, -100, 20, 12), { col: 0, row: 0, colSpan: 4, rowSpan: 2 })
})

// ── previewResizeRect ────────────────────────────────────────────────────

test('previewResizeRect grows/shrinks from each of the 8 edge/corner handles', () => {
  const start: GridRect = { col: 5, row: 5, colSpan: 4, rowSpan: 2 }

  const cases: Array<{ handle: ResizeHandle; deltaCol: number; deltaRow: number; expected: GridRect; label: string }> = [
    { handle: { hx: 1, hy: 0 }, deltaCol: 2, deltaRow: 0, expected: { col: 5, row: 5, colSpan: 6, rowSpan: 2 }, label: 'right edge grows colSpan, keeps col' },
    { handle: { hx: -1, hy: 0 }, deltaCol: -2, deltaRow: 0, expected: { col: 3, row: 5, colSpan: 6, rowSpan: 2 }, label: 'left edge moves col left, grows colSpan, right edge fixed' },
    { handle: { hx: 0, hy: 1 }, deltaCol: 0, deltaRow: 3, expected: { col: 5, row: 5, colSpan: 4, rowSpan: 5 }, label: 'bottom edge grows rowSpan, keeps row' },
    { handle: { hx: 0, hy: -1 }, deltaCol: 0, deltaRow: -2, expected: { col: 5, row: 3, colSpan: 4, rowSpan: 4 }, label: 'top edge moves row up, grows rowSpan, bottom edge fixed' },
    { handle: { hx: 1, hy: 1 }, deltaCol: 1, deltaRow: 1, expected: { col: 5, row: 5, colSpan: 5, rowSpan: 3 }, label: 'bottom-right corner grows both, keeps origin' },
    { handle: { hx: -1, hy: -1 }, deltaCol: -1, deltaRow: -1, expected: { col: 4, row: 4, colSpan: 5, rowSpan: 3 }, label: 'top-left corner moves origin, grows both, far edges fixed' },
    { handle: { hx: -1, hy: 1 }, deltaCol: -1, deltaRow: 1, expected: { col: 4, row: 5, colSpan: 5, rowSpan: 3 }, label: 'bottom-left corner moves col left, grows rowSpan down' },
    { handle: { hx: 1, hy: -1 }, deltaCol: 1, deltaRow: -1, expected: { col: 5, row: 4, colSpan: 5, rowSpan: 3 }, label: 'top-right corner moves row up, grows colSpan right' },
  ]

  for (const { handle, deltaCol, deltaRow, expected, label } of cases) {
    assert.deepEqual(previewResizeRect(start, handle, deltaCol, deltaRow, 20, 12), expected, label)
  }
})

test('previewResizeRect clamps to a minimum span of one cell when shrinking past it', () => {
  const start: GridRect = { col: 5, row: 5, colSpan: 4, rowSpan: 2 }

  assert.deepEqual(previewResizeRect(start, { hx: 1, hy: 0 }, -10, 0, 20, 12), { col: 5, row: 5, colSpan: 1, rowSpan: 2 })
  assert.deepEqual(previewResizeRect(start, { hx: -1, hy: 0 }, 10, 0, 20, 12), { col: 8, row: 5, colSpan: 1, rowSpan: 2 })
  assert.deepEqual(previewResizeRect(start, { hx: 0, hy: 1 }, 0, -10, 20, 12), { col: 5, row: 5, colSpan: 4, rowSpan: 1 })
  assert.deepEqual(previewResizeRect(start, { hx: 0, hy: -1 }, 0, 10, 20, 12), { col: 5, row: 6, colSpan: 4, rowSpan: 1 })
})

test('previewResizeRect clamps growth at the grid edge', () => {
  const start: GridRect = { col: 5, row: 5, colSpan: 4, rowSpan: 2 }

  // Only 15 columns remain to the right of col 5 (20 - 5); asking for +100 clamps there.
  assert.deepEqual(previewResizeRect(start, { hx: 1, hy: 0 }, 100, 0, 20, 12), { col: 5, row: 5, colSpan: 15, rowSpan: 2 })
  // Only 7 rows remain below row 5 (12 - 5).
  assert.deepEqual(previewResizeRect(start, { hx: 0, hy: 1 }, 0, 100, 20, 12), { col: 5, row: 5, colSpan: 4, rowSpan: 7 })
  // Left/top handles can't push col/row below 0.
  assert.deepEqual(previewResizeRect(start, { hx: -1, hy: -1 }, -100, -100, 20, 12), { col: 0, row: 0, colSpan: 9, rowSpan: 7 })
})

// ── applyThemePreset ─────────────────────────────────────────────────────

test('applyThemePreset sets theme + colorSystem on a new layout, leaving the source untouched', () => {
  const dash = layout(pageWithWidgets())
  const styled = applyThemePreset(dash, { primary: '#FF6A00', accent: '#E0A30C' }, 'styled')

  assert.deepEqual(styled.theme, { primary: '#FF6A00', accent: '#E0A30C' })
  assert.equal(styled.colorSystem, 'styled')
  assert.notEqual(styled, dash)
  assert.equal(dash.theme, undefined, 'the source layout keeps no theme override')
})

test('applyThemePreset resets to Graphite (empty theme, functional system)', () => {
  const dash = layout(pageWithWidgets(), { theme: { primary: '#FF0000' }, colorSystem: 'styled' })
  const graphite = applyThemePreset(dash, {}, 'functional')

  assert.deepEqual(graphite.theme, {})
  assert.equal(graphite.colorSystem, 'functional')
})

// ── fitScreenSize ────────────────────────────────────────────────────────

test('fitScreenSize keeps the aspect ratio and is bound by whichever side runs out first', () => {
  assert.deepEqual(fitScreenSize({ width: 800, height: 480 }, 640, 384), { width: 640, height: 384 }, 'landscape fills the box')
  assert.deepEqual(fitScreenSize({ width: 800, height: 800 }, 640, 384), { width: 384, height: 384 }, 'square is height-bound')
  assert.deepEqual(fitScreenSize({ width: 480, height: 854 }, 640, 384), { width: 216, height: 384 }, 'portrait stays inside the box')
})
