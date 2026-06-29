import test from 'node:test'
import assert from 'node:assert/strict'

import type { DashLayout, DashWidget, DashPage, DashWidgetStack } from '../../lib/dash/types.ts'
import { validateLayout, deriveSaveEligibility, type LayoutValidation } from './layoutValidation.ts'

const VALID: LayoutValidation = { valid: true, invalidWidgetIds: new Set(), messages: [] }
const INVALID: LayoutValidation = {
  valid: false,
  invalidWidgetIds: new Set(['a', 'b']),
  messages: ['Overlapping widgets on Main'],
}

function widget(overrides: Partial<DashWidget> & { id: string }): DashWidget {
  return { type: 'text', col: 0, row: 0, colSpan: 2, rowSpan: 2, ...overrides }
}

function stack(overrides: Partial<DashWidgetStack> & { id: string }): DashWidgetStack {
  return {
    name: overrides.id,
    col: 0,
    row: 0,
    colSpan: 6,
    rowSpan: 4,
    defaultLayerId: 'layer-1',
    layers: [{ id: 'layer-1', name: 'Layer 1', widgets: [] }],
    ...overrides,
  }
}

function page(overrides: Partial<DashPage> & { id: string }): DashPage {
  return { name: overrides.id, widgets: [], widgetStacks: [], ...overrides }
}

function layout(overrides: Partial<DashLayout> = {}): DashLayout {
  return {
    id: 'dash-1',
    name: 'Dash',
    default: false,
    gridCols: 20,
    gridRows: 12,
    idlePage: page({ id: 'idle' }),
    pages: [page({ id: 'page-1' })],
    alerts: [],
    ...overrides,
  }
}

test('flags both widgets when two widgets overlap on a page', () => {
  const result = validateLayout(layout({
    pages: [page({
      id: 'page-1',
      widgets: [
        widget({ id: 'a', col: 0, row: 0, colSpan: 4, rowSpan: 3 }),
        widget({ id: 'b', col: 2, row: 1, colSpan: 4, rowSpan: 3 }),
      ],
    })],
  }))

  assert.equal(result.valid, false)
  assert.ok(result.invalidWidgetIds.has('a'))
  assert.ok(result.invalidWidgetIds.has('b'))
})

test('treats edge-touching widgets as valid (no collision)', () => {
  const result = validateLayout(layout({
    pages: [page({
      id: 'page-1',
      widgets: [
        widget({ id: 'a', col: 0, row: 0, colSpan: 4, rowSpan: 4 }),
        widget({ id: 'b', col: 4, row: 0, colSpan: 4, rowSpan: 4 }),
        widget({ id: 'c', col: 0, row: 4, colSpan: 8, rowSpan: 2 }),
      ],
    })],
  }))

  assert.equal(result.valid, true)
  assert.equal(result.invalidWidgetIds.size, 0)
})

test('lists every participant across multiple simultaneous collisions and leaves clean widgets unflagged', () => {
  const result = validateLayout(layout({
    pages: [page({
      id: 'page-1',
      widgets: [
        widget({ id: 'a', col: 0, row: 0, colSpan: 4, rowSpan: 3 }),
        widget({ id: 'b', col: 2, row: 1, colSpan: 4, rowSpan: 3 }),
        widget({ id: 'c', col: 10, row: 0, colSpan: 4, rowSpan: 3 }),
        widget({ id: 'd', col: 12, row: 1, colSpan: 4, rowSpan: 3 }),
        widget({ id: 'lonely', col: 0, row: 8, colSpan: 4, rowSpan: 2 }),
      ],
    })],
  }))

  assert.equal(result.valid, false)
  assert.deepEqual(new Set(result.invalidWidgetIds), new Set(['a', 'b', 'c', 'd']))
  assert.equal(result.invalidWidgetIds.has('lonely'), false)
})

test('flags widgets that extend past the grid bounds but accepts edge-exact placement', () => {
  const result = validateLayout(layout({
    gridCols: 20,
    gridRows: 12,
    pages: [page({
      id: 'page-1',
      widgets: [
        widget({ id: 'edge', col: 16, row: 10, colSpan: 4, rowSpan: 2 }),
        widget({ id: 'over', col: 18, row: 0, colSpan: 4, rowSpan: 2 }),
        widget({ id: 'negative', col: -1, row: 0, colSpan: 2, rowSpan: 2 }),
      ],
    })],
  }))

  assert.equal(result.valid, false)
  assert.equal(result.invalidWidgetIds.has('over'), true)
  assert.equal(result.invalidWidgetIds.has('negative'), true)
  assert.equal(result.invalidWidgetIds.has('edge'), false)
})

test('validates the idle page as an independently rendered region', () => {
  const result = validateLayout(layout({
    idlePage: page({
      id: 'idle',
      widgets: [
        widget({ id: 'idle-a', col: 0, row: 0, colSpan: 6, rowSpan: 4 }),
        widget({ id: 'idle-b', col: 3, row: 2, colSpan: 6, rowSpan: 4 }),
      ],
    }),
    pages: [page({ id: 'page-1' })],
  }))

  assert.equal(result.valid, false)
  assert.ok(result.invalidWidgetIds.has('idle-a'))
  assert.ok(result.invalidWidgetIds.has('idle-b'))
})

test('flags a top-level widget that overlaps a widget-stack region', () => {
  const result = validateLayout(layout({
    pages: [page({
      id: 'page-1',
      widgets: [widget({ id: 'w', col: 4, row: 1, colSpan: 4, rowSpan: 3 })],
      widgetStacks: [stack({ id: 'stack-1', col: 0, row: 0, colSpan: 6, rowSpan: 4 })],
    })],
  }))

  assert.equal(result.valid, false)
  assert.ok(result.invalidWidgetIds.has('w'))
  assert.ok(result.invalidWidgetIds.has('stack-1'))
})

test('flags two widget-stack regions that overlap each other', () => {
  const result = validateLayout(layout({
    pages: [page({
      id: 'page-1',
      widgetStacks: [
        stack({ id: 'stack-a', col: 0, row: 0, colSpan: 8, rowSpan: 6 }),
        stack({ id: 'stack-b', col: 5, row: 3, colSpan: 8, rowSpan: 6 }),
      ],
    })],
  }))

  assert.equal(result.valid, false)
  assert.ok(result.invalidWidgetIds.has('stack-a'))
  assert.ok(result.invalidWidgetIds.has('stack-b'))
})

test('flags overlapping widgets within the same stack layer', () => {
  const result = validateLayout(layout({
    pages: [page({
      id: 'page-1',
      widgetStacks: [stack({
        id: 'stack-1',
        col: 2,
        row: 1,
        colSpan: 8,
        rowSpan: 6,
        layers: [{
          id: 'layer-1',
          name: 'Layer 1',
          widgets: [
            widget({ id: 'child-a', col: 0, row: 0, colSpan: 4, rowSpan: 3 }),
            widget({ id: 'child-b', col: 2, row: 1, colSpan: 4, rowSpan: 3 }),
          ],
        }],
      })],
    })],
  }))

  assert.equal(result.valid, false)
  assert.ok(result.invalidWidgetIds.has('child-a'))
  assert.ok(result.invalidWidgetIds.has('child-b'))
})

test('allows widgets in different layers of one stack to share grid rectangles', () => {
  const result = validateLayout(layout({
    pages: [page({
      id: 'page-1',
      widgetStacks: [stack({
        id: 'stack-1',
        col: 2,
        row: 1,
        colSpan: 8,
        rowSpan: 6,
        layers: [
          {
            id: 'layer-1',
            name: 'Layer 1',
            widgets: [widget({ id: 'l1-a', col: 0, row: 0, colSpan: 4, rowSpan: 3 })],
          },
          {
            id: 'layer-2',
            name: 'Layer 2',
            widgets: [widget({ id: 'l2-a', col: 0, row: 0, colSpan: 4, rowSpan: 3 })],
          },
        ],
      })],
    })],
  }))

  assert.equal(result.valid, true)
  assert.equal(result.invalidWidgetIds.size, 0)
})

test('reports no messages for a valid layout', () => {
  const result = validateLayout(layout({
    pages: [page({ id: 'page-1', name: 'Main', widgets: [widget({ id: 'a', col: 0, row: 0, colSpan: 4, rowSpan: 3 })] })],
  }))

  assert.deepEqual(result.messages, [])
})

test('produces a persistent message naming the page with overlapping widgets', () => {
  const result = validateLayout(layout({
    pages: [page({
      id: 'page-1',
      name: 'Main',
      widgets: [
        widget({ id: 'a', col: 0, row: 0, colSpan: 4, rowSpan: 3 }),
        widget({ id: 'b', col: 2, row: 1, colSpan: 4, rowSpan: 3 }),
      ],
    })],
  }))

  assert.equal(result.valid, false)
  assert.ok(result.messages.length > 0)
  assert.ok(result.messages.some(message => message.includes('Main')))
  assert.ok(result.messages.some(message => /overlap/i.test(message)))
})

test('save is eligible when the layout is valid, dirty, and not mid-save', () => {
  const result = deriveSaveEligibility({ validation: VALID, isDirty: true, saving: false })
  assert.equal(result.canSave, true)
  assert.equal(result.reason, null)
})

test('save is blocked with an explanatory reason while the layout is invalid (PRD #20, #21)', () => {
  const result = deriveSaveEligibility({ validation: INVALID, isDirty: true, saving: false })
  assert.equal(result.canSave, false)
  assert.ok(result.reason && result.reason.length > 0)
  assert.ok(/Overlapping widgets on Main/.test(result.reason))
})

test('save eligibility is restored immediately once the layout becomes valid again (PRD #22)', () => {
  const blocked = deriveSaveEligibility({ validation: INVALID, isDirty: true, saving: false })
  const restored = deriveSaveEligibility({ validation: VALID, isDirty: true, saving: false })
  assert.equal(blocked.canSave, false)
  assert.equal(restored.canSave, true)
})

test('save is blocked while a save is already in flight', () => {
  const result = deriveSaveEligibility({ validation: VALID, isDirty: true, saving: true })
  assert.equal(result.canSave, false)
})

test('save is blocked (without conflict text) when there are no pending changes', () => {
  const result = deriveSaveEligibility({ validation: VALID, isDirty: false, saving: false })
  assert.equal(result.canSave, false)
  assert.equal(/Cannot save/.test(result.reason ?? ''), false)
})
