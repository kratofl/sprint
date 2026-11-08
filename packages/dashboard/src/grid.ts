// Pure grid/layout math: grid-rect placement and page selection for the dash
// renderer. No React, no DOM — just the numbers used to place widgets on a pixel
// canvas, consumed by DashRenderer.tsx to position DOM elements.

import type { DashLayout, DashPage } from './index'
import { drawnWidgets } from './groups'

export interface PixelRect {
  left: number
  top: number
  width: number
  height: number
}

export interface GridSpan {
  col: number
  row: number
  colSpan: number
  rowSpan: number
}

/**
 * One edge of a widget's span, mapped from a grid line to a pixel column/row.
 * `edge`, `total`, and `divisions` are always non-negative in this domain (grid
 * indices and canvas dimensions), so `Math.round`'s "round half up" behavior is
 * equivalent to .NET's `MidpointRounding.AwayFromZero` used by `GridEdge`.
 */
function gridEdge(total: number, divisions: number, edge: number): number {
  if (total <= 0 || divisions <= 0) {
    return 0
  }

  const pos = Math.round((edge * total) / divisions)
  return Math.min(Math.max(pos, 0), total)
}

function normalizeEdges(start: number, end: number, total: number): [number, number] {
  if (total <= 0) {
    return [0, 0]
  }

  const clampedStart = Math.min(Math.max(start, 0), total - 1)
  const rawEnd = end <= clampedStart ? clampedStart + 1 : end
  const clampedEnd = Math.min(rawEnd, total)
  return [clampedStart, clampedEnd]
}

/** A widget's rectangle in pixels, given the layout's grid and canvas size. */
export function gridRect(width: number, height: number, cols: number, rows: number, span: GridSpan): PixelRect {
  const left = gridEdge(width, cols, span.col)
  const right = gridEdge(width, cols, span.col + span.colSpan)
  const top = gridEdge(height, rows, span.row)
  const bottom = gridEdge(height, rows, span.row + span.rowSpan)
  const [normLeft, normRight] = normalizeEdges(left, right, width)
  const [normTop, normBottom] = normalizeEdges(top, bottom, height)
  return { left: normLeft, top: normTop, width: normRight - normLeft, height: normBottom - normTop }
}

/**
 * The same raw grid-edge math as `gridRect`, without the clamp/normalize pass —
 * computes an alert banner's panel directly from the grid edges and insets it by
 * 2px.
 */
export function alertPanelRect(width: number, height: number, span: { col: number; row: number; colSpan: number; rowSpan: number; gridCols: number; gridRows: number }): PixelRect {
  const left = gridEdge(width, span.gridCols, span.col)
  const top = gridEdge(height, span.gridRows, span.row)
  const right = gridEdge(width, span.gridCols, span.col + span.colSpan)
  const bottom = gridEdge(height, span.gridRows, span.row + span.rowSpan)
  return { left: left + 2, top: top + 2, width: right - 2 - (left + 2), height: bottom - 2 - (top + 2) }
}

/**
 * The bounds of the compact RaceLogic-inspired information island: a panel that
 * stays 4:1 in every orientation, centered on the canvas, leaving the rest of
 * the frame untouched.
 */
export function raceLogicPanelBounds(width: number, height: number): PixelRect {
  const panelWidth = Math.max(4, width - (width % 4))
  const panelHeight = Math.min(height, Math.floor(panelWidth / 4))
  return { left: (width - panelWidth) / 2, top: (height - panelHeight) / 2, width: panelWidth, height: panelHeight }
}

/** Selects the page to render: idle takes priority, then an explicit id, then the first page. */
export function selectPage(layout: DashLayout, pageId: string | undefined, idle: boolean): DashPage | null {
  if (idle) {
    return layout.idlePage ?? layout.pages[0] ?? null
  }

  if (pageId) {
    const lowerId = pageId.toLowerCase()
    const match = layout.pages.find((page) => page.id.toLowerCase() === lowerId)
    if (match) {
      return match
    }

    if (layout.idlePage && layout.idlePage.id.toLowerCase() === lowerId) {
      return layout.idlePage
    }

    return layout.pages[0] ?? null
  }

  return layout.pages[0] ?? layout.idlePage ?? null
}

/** True when `page` draws the full-canvas RaceLogic lap timer (hidden widgets and stack layers it does not show do not count). */
export function pageHasRaceLogicLapTimer(page: DashPage | null): boolean {
  return page !== null && drawnWidgets(page).some((widget) => widget.type === 'racelogic_lap_timer')
}
