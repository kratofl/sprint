import type { DashLayout } from '../../lib/dash/types.ts'

export interface LayoutValidation {
  valid: boolean
  invalidWidgetIds: ReadonlySet<string>
  messages: readonly string[]
}

export interface SaveEligibility {
  /** Whether the Save control should be enabled. */
  canSave: boolean
  /** Human-readable explanation for a disabled control, or null when saving is allowed. */
  reason: string | null
}

/**
 * Derive whether the dashboard can be saved. Layout validity is an additional gate on
 * top of the existing dirty/saving state: an invalid (overlapping/out-of-bounds) layout
 * can never be persisted, and the disabled control explains why. Save becomes eligible
 * again the moment the layout is valid (and there are pending changes).
 */
export function deriveSaveEligibility(input: {
  validation: LayoutValidation
  isDirty: boolean
  saving: boolean
}): SaveEligibility {
  const { validation, isDirty, saving } = input
  if (saving) return { canSave: false, reason: 'Saving…' }
  if (!validation.valid) {
    const detail = validation.messages.length > 0
      ? validation.messages.join('; ')
      : 'resolve layout conflicts first'
    return { canSave: false, reason: `Cannot save: ${detail}` }
  }
  if (!isDirty) return { canSave: false, reason: 'No changes to save' }
  return { canSave: true, reason: null }
}

interface Rect {
  col: number
  row: number
  colSpan: number
  rowSpan: number
}

/** Two grid rectangles overlap. Touching edges (shared boundary) are NOT an overlap. */
function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.col < b.col + b.colSpan &&
    a.col + a.colSpan > b.col &&
    a.row < b.row + b.rowSpan &&
    a.row + a.rowSpan > b.row
  )
}

/** A rectangle fits inside a `cols`×`rows` region; edge-exact placement is in bounds. */
function withinBounds(rect: Rect, cols: number, rows: number): boolean {
  return (
    rect.col >= 0 &&
    rect.row >= 0 &&
    rect.col + rect.colSpan <= cols &&
    rect.row + rect.rowSpan <= rows
  )
}

interface RegionIssues {
  overlapping: boolean
  outOfBounds: boolean
}

/**
 * Flag every member of `rects` that sits outside `cols`×`rows` or overlaps a sibling.
 * Returns whether this region had any overlap / out-of-bounds problem so the caller
 * can build a human-readable message naming the area.
 */
function collectInvalidRects(
  rects: readonly (Rect & { id: string })[],
  cols: number,
  rows: number,
  invalid: Set<string>,
): RegionIssues {
  const issues: RegionIssues = { overlapping: false, outOfBounds: false }
  for (const rect of rects) {
    if (!withinBounds(rect, cols, rows)) {
      invalid.add(rect.id)
      issues.outOfBounds = true
    }
  }
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (overlaps(rects[i], rects[j])) {
        invalid.add(rects[i].id)
        invalid.add(rects[j].id)
        issues.overlapping = true
      }
    }
  }
  return issues
}

function describeIssues(area: string, issues: RegionIssues, messages: string[]): void {
  if (issues.overlapping) messages.push(`Overlapping widgets on ${area}`)
  if (issues.outOfBounds) messages.push(`A widget extends past the bounds on ${area}`)
}

export function validateLayout(layout: DashLayout): LayoutValidation {
  const invalidWidgetIds = new Set<string>()
  const messages: string[] = []

  const pages = [
    { page: layout.idlePage, label: layout.idlePage.name || 'Idle' },
    ...layout.pages.map(page => ({ page, label: page.name || 'a page' })),
  ]

  for (const { page, label } of pages) {
    const stacks = page.widgetStacks ?? []
    const pageRects: (Rect & { id: string })[] = [...page.widgets, ...stacks]
    describeIssues(label, collectInvalidRects(pageRects, layout.gridCols, layout.gridRows, invalidWidgetIds), messages)

    // Each stack layer is its own independently rendered region: its widgets use
    // stack-relative coordinates and only one layer is visible at a time, so layers
    // are validated against the stack's bounds and against siblings in the SAME layer.
    for (const stack of stacks) {
      for (const stackLayer of stack.layers) {
        const area = `${stack.name} · ${stackLayer.name}`
        describeIssues(area, collectInvalidRects(stackLayer.widgets, stack.colSpan, stack.rowSpan, invalidWidgetIds), messages)
      }
    }
  }

  return {
    valid: invalidWidgetIds.size === 0,
    invalidWidgetIds,
    messages,
  }
}
