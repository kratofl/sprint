// Pure grid/layout math: grid-rect placement and page/layer selection for the dash
// renderer. No React, no DOM — just the numbers used to place widgets on a pixel
// canvas, consumed by DashRenderer.tsx to position DOM elements.

import type { DashLayout, DashPage, DashWidget, DashWidgetStack, DashWidgetStackLayer } from './index'

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

/** A widget's (or widget-stack's) rectangle in pixels, given the layout's grid and canvas size. */
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

/** Maps a widget positioned in a `cols`x`rows` sub-grid into pixels inside `rect` (widget stacks). */
export function subRect(rect: PixelRect, cols: number, rows: number, widget: GridSpan): PixelRect {
  const cw = rect.width / cols
  const ch = rect.height / rows
  const left = rect.left + widget.col * cw
  const top = rect.top + widget.row * ch
  const right = rect.left + Math.min(cols, widget.col + widget.colSpan) * cw
  const bottom = rect.top + Math.min(rows, widget.row + widget.rowSpan) * ch
  return { left, top, width: right - left, height: bottom - top }
}

/** The inset content rectangle inside a widget's outer rect, after its instrument-frame border. */
export function contentRect(rect: PixelRect, type: string): PixelRect {
  const maxInset = type === 'rpm_bar' || type === 'header' ? 2 : 6
  const inset = Math.min(maxInset, Math.min(rect.width, rect.height) * 0.08)
  return { left: rect.left + inset, top: rect.top + inset, width: rect.width - inset * 2, height: rect.height - inset * 2 }
}

/** Widget types that draw the compact outlined instrument frame unless a widget explicitly overrides it. */
export function usesInstrumentFrame(type: string): boolean {
  return (
    type === 'gear_speed' ||
    type === 'input_trace' ||
    type === 'sector' ||
    type === 'lap_time' ||
    type === 'fuel' ||
    type === 'tyre_temp' ||
    type === 'tyre_pressure' ||
    type === 'gaps'
  )
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

/** Selects a widget stack's visible layer: `defaultLayerId` when it matches, else the first layer. */
export function selectLayer(stack: DashWidgetStack): DashWidgetStackLayer | null {
  if (stack.defaultLayerId) {
    const lowerId = stack.defaultLayerId.toLowerCase()
    const match = stack.layers.find((layer) => layer.id.toLowerCase() === lowerId)
    if (match) {
      return match
    }
  }

  return stack.layers[0] ?? null
}

/** True when `page` (its top-level widgets or its selected stack layers) contains the full-canvas RaceLogic lap timer. */
export function pageHasRaceLogicLapTimer(page: DashPage | null): boolean {
  if (!page) {
    return false
  }

  if (page.widgets.some((widget: DashWidget) => widget.type === 'racelogic_lap_timer')) {
    return true
  }

  return (page.widgetStacks ?? []).some((stack) => {
    const layer = selectLayer(stack)
    return layer ? layer.widgets.some((widget) => widget.type === 'racelogic_lap_timer') : false
  })
}
