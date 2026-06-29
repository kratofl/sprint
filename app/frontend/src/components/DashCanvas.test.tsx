import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import type { DashWidget } from '@/lib/dash'
import { DEFAULT_DASH_THEME } from '@/lib/dash/defaults'
import { DashCanvas } from './DashCanvas'

// Behavioral render tests for the editor canvas (vitest + jsdom).
// Collision presentation: widgets/stacks whose ids are reported invalid by
// layout validation must be visibly marked, more prominently than the grid.

const widget = (over: Partial<DashWidget> & { id: string }): DashWidget => ({
  type: 'text',
  col: 0,
  row: 0,
  colSpan: 2,
  rowSpan: 2,
  ...over,
})

describe('DashCanvas collision presentation', () => {
  it('marks exactly the widgets whose ids are in invalidIds', () => {
    const { container } = render(
      <DashCanvas
        widgets={[
          widget({ id: 'a', col: 0, row: 0, colSpan: 4, rowSpan: 3 }),
          widget({ id: 'b', col: 2, row: 1, colSpan: 4, rowSpan: 3 }),
          widget({ id: 'c', col: 12, row: 0, colSpan: 3, rowSpan: 2 }),
        ]}
        selectedId={null}
        theme={DEFAULT_DASH_THEME}
        invalidIds={new Set(['a', 'b'])}
        onSelect={() => {}}
        onUpdate={() => {}}
      />,
    )

    expect(container.querySelectorAll('[data-invalid="true"]').length).toBe(2)
  })

  it('renders the placement grid as a dotted field, not visible grid lines', () => {
    const { container } = render(
      <DashCanvas
        widgets={[]}
        selectedId={null}
        theme={DEFAULT_DASH_THEME}
        gridCols={20}
        gridRows={12}
        onSelect={() => {}}
        onUpdate={() => {}}
      />,
    )

    const grid = container.querySelector('[data-testid="placement-grid"]')
    expect(grid).not.toBeNull()
    expect(grid!.querySelectorAll('line').length).toBe(0)
    expect(grid!.querySelectorAll('circle').length).toBeGreaterThan(0)
  })

  it('marks an invalid widget-stack overlay region', () => {
    const { container } = render(
      <DashCanvas
        widgets={[]}
        selectedId={null}
        theme={DEFAULT_DASH_THEME}
        invalidIds={new Set(['stack-1'])}
        overlayRects={[{ id: 'stack-1', col: 0, row: 0, colSpan: 6, rowSpan: 4, label: 'Stack' }]}
        onSelect={() => {}}
        onUpdate={() => {}}
      />,
    )

    expect(container.querySelectorAll('[data-invalid="true"]').length).toBe(1)
  })
})
