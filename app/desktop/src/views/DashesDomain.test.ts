import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DashLayout, DashPage, DashWidget } from '@sprint/dashboard'
import {
  ALL_DASHES,
  SCREEN_PROFILES,
  addWidget,
  addWidgetAt,
  growToSmallest,
  holdsSmallestAt,
  widgetFormAt,
  buildDashCreate,
  canPlaceNewWidget,
  dashCategoryNameProblem,
  dashSummary,
  dashesFilterOptions,
  fitScreenSize,
  groupDashes,
  initialScreenProfile,
  newDashCategory,
  parseDashLayout,
  previewMoveRect,
  previewResizeRect,
  refitLoss,
  refitLossHint,
  refitLossNote,
  refitLossWarning,
  resolveDashesFilter,
  screenChoices,
  setWidgetLook,
  swapWidgets,
  type GridRect,
  type ResizeHandle,
  widgetName,
} from './DashesDomain'

// ── Test fixtures ────────────────────────────────────────────────────────
// A plain 20x12 page grid, mirroring the default screen profile, with a couple
// of pre-placed widgets to overlap against.

function widget(id: string, col: number, row: number, colSpan: number, rowSpan: number): DashWidget {
  return { id, type: 'text', col, row, colSpan, rowSpan }
}

function layout(page: DashPage, overrides: Partial<DashLayout> = {}): DashLayout {
  return { id: 'dash-1', name: 'Dash', mode: 'basic', gridCols: 20, gridRows: 12, pages: [page], alerts: [], ...overrides }
}

function pageWithWidgets(...widgets: DashWidget[]): DashPage {
  return { id: 'page-1', name: 'Page 1', widgets }
}

// ── canPlaceNewWidget ────────────────────────────────────────────────────

test('canPlaceNewWidget accepts a free in-bounds rect and rejects an overlapping one', () => {
  const existing = widget('rpm', 0, 0, 20, 1)
  const dash = layout(pageWithWidgets(existing))

  assert.equal(canPlaceNewWidget(dash, 'page-1', 'text', { col: 0, row: 1, colSpan: 4, rowSpan: 2 }), true)
  assert.equal(canPlaceNewWidget(dash, 'page-1', 'text', { col: 0, row: 0, colSpan: 4, rowSpan: 2 }), false, 'overlaps the RPM bar')
})

test('canPlaceNewWidget rejects a rect that runs off either grid edge', () => {
  const dash = layout(pageWithWidgets())

  assert.equal(canPlaceNewWidget(dash, 'page-1', 'text', { col: 18, row: 0, colSpan: 4, rowSpan: 2 }), false, 'colSpan runs past gridCols')
  assert.equal(canPlaceNewWidget(dash, 'page-1', 'text', { col: 0, row: 11, colSpan: 4, rowSpan: 2 }), false, 'rowSpan runs past gridRows')
  assert.equal(canPlaceNewWidget(dash, 'page-1', 'text', { col: -1, row: 0, colSpan: 4, rowSpan: 2 }), false, 'negative col')
})

test('canPlaceNewWidget returns false for an unknown page', () => {
  const dash = layout(pageWithWidgets())
  assert.equal(canPlaceNewWidget(dash, 'no-such-page', 'text', { col: 0, row: 0, colSpan: 4, rowSpan: 2 }), false)
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

// ── Overlap inside groups ────────────────────────────────────────────────

test('a new widget may share cells only with the other layers of the stack it goes into', () => {
  const dash = layout({
    id: 'page-1',
    name: 'Page 1',
    widgets: [{ ...widget('timing', 0, 0, 4, 2), group: 'stack' }],
    groups: [{ id: 'stack', name: 'Right column', mode: 'oneAtATime' }],
  })
  const spot = { col: 0, row: 0, colSpan: 4, rowSpan: 2 }

  assert.equal(canPlaceNewWidget(dash, 'page-1', 'text', spot), false, 'on the page')
  assert.equal(canPlaceNewWidget(dash, 'page-1', 'text', spot, 'stack'), true, 'as a new layer of the stack')
  assert.equal(addWidgetAt(dash, 'page-1', 'text', 0, 0, 'stack')?.widget.group, 'stack')
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

test("a dash's lap review boxes survive parsing; a malformed one is left unset", () => {
  const row = { id: 'd', gridCols: 20, gridRows: 12, pages: [], alerts: [] }
  assert.deepEqual(parseDashLayout({ ...row, lapReview: { cells: ['lap', 7, 'none'] } })?.lapReview, { cells: ['lap', 'none'] })
  assert.equal(parseDashLayout({ ...row, lapReview: ['lap'] })?.lapReview, undefined)
  assert.equal(parseDashLayout(row)?.lapReview, undefined)
})

test("a dash's pit limiter survives parsing with its whole widgets; an unknown style is the default", () => {
  const row = { id: 'd', gridCols: 11, gridRows: 9, pages: [], alerts: [] }
  const speed = { id: 's', type: 'speed', col: 5, row: 4, colSpan: 1, rowSpan: 1 }
  assert.deepEqual(parseDashLayout({ ...row, pitLimiter: { style: 'box', widgets: [speed, { id: 'x' }] } })?.pitLimiter, { style: 'box', widgets: [speed] })
  assert.deepEqual(parseDashLayout({ ...row, pitLimiter: { style: 'neon' } })?.pitLimiter, { style: 'gear', widgets: [] })
  assert.equal(parseDashLayout(row)?.pitLimiter, undefined)
})

// ── Categories and New dash ──────────────────────────────────────────────

test('a stored category survives parsing; null, blank and the retired default flag leave none', () => {
  const row = { id: 'd', gridCols: 20, gridRows: 12, pages: [], alerts: [] }
  assert.equal(parseDashLayout({ ...row, category: 'Race' })?.category, 'Race')
  assert.equal(parseDashLayout({ ...row, category: null })?.category, undefined)
  assert.equal(parseDashLayout({ ...row, category: '' })?.category, undefined)
  assert.equal('default' in (parseDashLayout({ ...row, default: true }) ?? {}), false)
})

test('buildDashCreate sends a blank start without a source, a copy with one, and only the fields given', () => {
  assert.deepEqual(buildDashCreate(), { type: 'dash.create' })
  assert.deepEqual(buildDashCreate({ start: { kind: 'blank' }, profileId: 'square-800x800', name: 'Quali', category: null }), {
    type: 'dash.create',
    profileId: 'square-800x800',
    name: 'Quali',
    category: null,
  })
  assert.deepEqual(buildDashCreate({ start: { kind: 'copy', dashId: 'd1' }, category: 'Race' }), { type: 'dash.create', sourceDashId: 'd1', category: 'Race' })
})

// ── fitScreenSize ────────────────────────────────────────────────────────

test('fitScreenSize keeps the aspect ratio and is bound by whichever side runs out first', () => {
  assert.deepEqual(fitScreenSize({ width: 800, height: 480 }, 640, 384), { width: 640, height: 384 }, 'landscape fills the box')
  assert.deepEqual(fitScreenSize({ width: 800, height: 800 }, 640, 384), { width: 384, height: 384 }, 'square is height-bound')
  assert.deepEqual(fitScreenSize({ width: 480, height: 854 }, 640, 384), { width: 216, height: 384 }, 'portrait stays inside the box')
})

// ── Dashes overview ──────────────────────────────────────────────────────

const CATEGORIES = { builtIn: ['Race', 'Qualifying', 'Practice', 'Endurance'], custom: ['League'] }
const filed = (id: string, category?: string): DashLayout => layout(pageWithWidgets(), category === undefined ? { id } : { id, category })

test('groupDashes orders built-ins, then custom, then Other, and leaves empty categories out', () => {
  const groups = groupDashes([filed('a'), filed('b', 'Endurance'), filed('c', 'League'), filed('d', 'Race'), filed('e', 'Gone'), filed('f', 'Race')], CATEGORIES)
  assert.deepEqual(
    groups.map((group) => [group.title, group.custom, group.dashes.map((dash) => dash.id)]),
    [
      ['Race', false, ['d', 'f']],
      ['Endurance', false, ['b']],
      ['League', true, ['c']],
      ['Other', false, ['a', 'e']],
    ],
    'a category the host no longer knows counts as Other',
  )
})

test('the filter bar counts each group, keeps an emptied filter, and is left out when everything is in one group', () => {
  const groups = groupDashes([filed('a', 'Race'), filed('b', 'Race'), filed('c')], CATEGORIES)
  assert.deepEqual(
    dashesFilterOptions(groups, ALL_DASHES)?.map((option) => [option.label, option.count]),
    [
      ['All', 3],
      ['Race', 2],
      ['Other', 1],
    ],
  )
  assert.deepEqual(dashesFilterOptions(groups, { kind: 'category', name: 'Endurance' })?.at(-1), { filter: { kind: 'category', name: 'Endurance' }, label: 'Endurance', count: 0 })
  assert.equal(dashesFilterOptions(groupDashes([filed('a', 'Race')], CATEGORIES), ALL_DASHES), null)
})

test('a filter on a deleted category falls back to All; a new dash starts in the category being looked at', () => {
  assert.deepEqual(resolveDashesFilter({ kind: 'category', name: 'Gone' }, CATEGORIES), ALL_DASHES)
  assert.deepEqual(resolveDashesFilter({ kind: 'category', name: 'League' }, CATEGORIES), { kind: 'category', name: 'League' })
  assert.equal(newDashCategory({ kind: 'category', name: 'Race' }), 'Race')
  assert.equal(newDashCategory({ kind: 'other' }), null)
  assert.equal(newDashCategory(ALL_DASHES), null)
})

test('screenChoices puts the sizes of your screens first, naming each screen once', () => {
  const { fitting, other } = screenChoices([
    { name: 'Omega', width: 800, height: 480 },
    { name: 'USBD480', width: 480, height: 800 },
    { name: 'Omega', width: 800, height: 480 },
    { name: 'Odd', width: 320, height: 240 },
  ])
  assert.deepEqual(
    fitting.map((choice) => [choice.profile.id, choice.fits]),
    [
      ['landscape-800x480', ['Omega']],
      ['portrait-480x800', ['USBD480']],
    ],
  )
  assert.equal(other.length, SCREEN_PROFILES.length - 2)
  assert.equal(initialScreenProfile(null, fitting).id, 'landscape-800x480')
  assert.equal(initialScreenProfile(null, []).id, SCREEN_PROFILES[0].id)
  assert.equal(initialScreenProfile(filed('x'), []).id, 'landscape-800x480', 'a copy keeps its own size')
})

test('refit losses are looked up per dash and size, and worded with the right number', () => {
  const portrait = SCREEN_PROFILES.find((profile) => profile.id === 'portrait-480x800')
  assert.ok(portrait)
  const losses = { d1: { 'portrait-480x800': 4 } }
  assert.equal(refitLoss(losses, 'd1', 'portrait-480x800'), 4)
  assert.equal(refitLoss(losses, 'd1', 'square-800x800'), 0)
  assert.equal(refitLoss(losses, 'd2', 'portrait-480x800'), 0)
  assert.equal(refitLossWarning(4, portrait), "4 widgets don't fit on Portrait 480 × 800 and will be left out.")
  assert.equal(refitLossWarning(1, portrait), "1 widget doesn't fit on Portrait 480 × 800 and will be left out.")
  assert.equal(refitLossNote(1, portrait), "1 widget didn't fit on Portrait 480 × 800 and was left out. Undo brings it back.")
  assert.equal(refitLossNote(3, portrait), "3 widgets didn't fit on Portrait 480 × 800 and were left out. Undo brings them back.")
  assert.equal(refitLossHint(2), "2 widgets don't fit")
})

test('dashCategoryNameProblem mirrors the host: blank, reserved, built-in and taken names are refused', () => {
  assert.equal(dashCategoryNameProblem('Side screens', CATEGORIES), null)
  assert.notEqual(dashCategoryNameProblem('  ', CATEGORIES), null)
  assert.notEqual(dashCategoryNameProblem('other', CATEGORIES), null)
  assert.notEqual(dashCategoryNameProblem('race', CATEGORIES), null)
  assert.notEqual(dashCategoryNameProblem('league', CATEGORIES), null)
  assert.equal(dashCategoryNameProblem('LEAGUE', CATEGORIES, 'League'), null, 'renaming may change only the casing')
})

test('a dash summary names its screen and counts the idle page', () => {
  const dash = layout(pageWithWidgets(), { screenProfile: 'portrait-480x800', idlePage: { id: 'idle', name: 'Idle', widgets: [] } })
  assert.equal(dashSummary(dash), 'Portrait 480 × 800 · 2 pages')
  assert.equal(dashSummary(layout(pageWithWidgets())), 'Landscape 800 × 480 · 1 page')
})

// ── Alerts ───────────────────────────────────────────────────────────────

test('alert rows: absent look fields arrive as null from the host and are dropped', () => {
  const alert = { id: 'tc_change', type: 'tc_change', enabled: true, col: 6, row: 3, colSpan: 8, rowSpan: 6, displayMode: null, colorToken: null, durationSeconds: null, invertColors: null }
  const parsed = parseDashLayout({ id: 'd', gridCols: 20, gridRows: 12, pages: [], alerts: [alert, { id: 'broken' }] })
  assert.deepEqual(parsed?.alerts, [{ id: 'tc_change', type: 'tc_change', enabled: true, col: 6, row: 3, colSpan: 8, rowSpan: 6 }])
})

const trackedDash = (widgets: DashWidget[]): DashLayout => ({
  id: 'tracked', name: 'Tracked', mode: 'basic', gridCols: 10, gridRows: 9, colSizes: [40, 90, 90, 90, 90, 90, 90, 90, 90, 40], rowSizes: [36, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5], alerts: [],
  pages: [{ id: 'page-1', name: 'Page 1', widgets }],
})

test('on a dash with its own tracks a new widget is two cells by one, anywhere free', () => {
  const dash = trackedDash([{ id: 'gear', type: 'gear', col: 4, row: 1, colSpan: 2, rowSpan: 3 }])
  assert.deepEqual(addWidgetAt(dash, 'page-1', 'bar', 0, 4)?.widget, { id: 'bar', type: 'bar', col: 0, row: 4, colSpan: 2, rowSpan: 1 })
  assert.deepEqual(addWidgetAt(dash, 'page-1', 'last_lap', 9, 8)?.widget, { id: 'last-lap', type: 'last_lap', col: 8, row: 8, colSpan: 2, rowSpan: 1 }, 'pulled back inside')
  assert.equal(addWidgetAt(dash, 'page-1', 'last_lap', 4, 2), null, 'the gear')
  assert.deepEqual(addWidget(dash, 'page-1', 'last_lap')?.widget, { id: 'last-lap', type: 'last_lap', col: 0, row: 1, colSpan: 2, rowSpan: 1 }, 'the first spot that holds a lap time: the top row is too short')
})

test('a widget never gets smaller than its smallest form, and grows toward the side it is dragged from', () => {
  const dash = trackedDash([])
  // A lap time needs 130 wide at 800x480: one 90 column is too narrow, so it takes a second.
  assert.deepEqual(growToSmallest(dash, 'last_lap', { col: 3, row: 2, colSpan: 1, rowSpan: 1 }, { hx: 1, hy: 0 }), { col: 3, row: 2, colSpan: 2, rowSpan: 1 })
  assert.deepEqual(growToSmallest(dash, 'last_lap', { col: 3, row: 2, colSpan: 1, rowSpan: 1 }, { hx: -1, hy: 0 }), { col: 2, row: 2, colSpan: 2, rowSpan: 1 })
  assert.deepEqual(growToSmallest(dash, 'last_lap', { col: 3, row: 2, colSpan: 1, rowSpan: 1 }, { hx: 0, hy: 1 }), { col: 3, row: 2, colSpan: 1, rowSpan: 1 }, 'a side the drag leaves alone stays')
  assert.equal(holdsSmallestAt(dash, 'tyre', { col: 1, row: 1, colSpan: 1, rowSpan: 1 }), false)
  assert.deepEqual(widgetFormAt(dash, 'tyre', { col: 1, row: 1, colSpan: 1, rowSpan: 2 }).form.name, 'Small', '90 x 111')
  assert.deepEqual(widgetFormAt(dash, 'tyre', { col: 1, row: 1, colSpan: 2, rowSpan: 2 }).form.name, 'Large', '180 x 111')
  assert.deepEqual(widgetFormAt({ ...dash, rowSizes: [36, 80, 80, 80, 80, 31, 31, 31, 31] }, 'tyre', { col: 1, row: 1, colSpan: 2, rowSpan: 1 }).form.name, 'Compact', 'a row resized to 80: too short for Large')
})

test('a dash keeps its track sizes only when there is one per column and row', () => {
  const row = { id: 'd', gridCols: 10, gridRows: 9, pages: [], alerts: [] }
  assert.deepEqual(parseDashLayout({ ...row, colSizes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], rowSizes: [1, 1, 1, 1, 1, 1, 1, 1, 1] })?.colSizes?.length, 10)
  assert.equal(parseDashLayout({ ...row, colSizes: [1, 1], rowSizes: [1, 1, 1, 1, 1, 1, 1, 1, 1] })?.colSizes, undefined)
  assert.equal(parseDashLayout({ ...row, colSizes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] })?.colSizes, undefined, 'both or neither')
})

test('two widgets swap places when each fits the other\'s, and not otherwise', () => {
  const dash = trackedDash([
    { id: 'tc', type: 'tc', col: 1, row: 1, colSpan: 2, rowSpan: 2 },
    { id: 'last', type: 'last_lap', col: 5, row: 4, colSpan: 1, rowSpan: 1 },
    { id: 'fuel', type: 'bar', col: 9, row: 0, colSpan: 1, rowSpan: 9 },
    { id: 'pos', type: 'position', col: 0, row: 8, colSpan: 1, rowSpan: 1 },
  ])
  const swapped = swapWidgets(dash, 'page-1', 'tc', 'last')
  assert.deepEqual(swapped?.pages[0]?.widgets.slice(0, 2).map(({ id, col, row, colSpan, rowSpan }) => ({ id, col, row, colSpan, rowSpan })), [
    { id: 'tc', col: 5, row: 4, colSpan: 1, rowSpan: 1 },
    { id: 'last', col: 1, row: 1, colSpan: 2, rowSpan: 2 },
  ])
  assert.ok(swapWidgets(dash, 'page-1', 'tc', 'fuel'), 'any widget may go where a bar was')
})

test('a widget turns its label and frame off and on, and writes nothing while both are on', () => {
  const dash = trackedDash([{ id: 'tc', type: 'tc', col: 1, row: 1, colSpan: 2, rowSpan: 2 }])
  const bare = setWidgetLook(dash, 'page-1', 'tc', 'frame', false)
  const quiet = bare && setWidgetLook(bare, 'page-1', 'tc', 'label', false)
  assert.deepEqual(quiet?.pages[0]?.widgets[0]?.style, { frame: 'off', label: 'off' })
  assert.equal(quiet && setWidgetLook(quiet, 'page-1', 'tc', 'label', false), null, 'already off')
  const framed = quiet && setWidgetLook(quiet, 'page-1', 'tc', 'frame', true)
  const back = framed && setWidgetLook(framed, 'page-1', 'tc', 'label', true)
  assert.equal(back?.pages[0]?.widgets[0]?.style, undefined)
})

test('a placed widget is named by what it shows when its type alone is ambiguous', () => {
  const widget = (type: string, config?: Record<string, unknown>): DashWidget => ({ id: 'w', type, col: 0, row: 0, colSpan: 1, rowSpan: 1, config })
  assert.equal(widgetName(widget('bar', { channel: 've' })), 'Virtual energy bar')
  assert.equal(widgetName(widget('bar')), 'Fuel bar', 'an unset channel is the default one')
  assert.equal(widgetName(widget('tyre', { corner: 'rl' })), 'Rear left tyre')
  assert.equal(widgetName(widget('session_best')), 'Session Best')
  assert.equal(widgetName(widget('gap_behind')), 'Gap Behind')
  assert.equal(widgetName(widget('tc2')), 'TC 2')
})
