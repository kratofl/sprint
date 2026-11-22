// The pit limiter overlay: what a dash shows over its page while the pit limiter is on (and the
// app-wide `pit_limiter` alert is on). The layout's `pitLimiter` picks the look and holds the
// overlay's own widgets, placed on an empty copy of the dash's grid; the Rust renderer
// (renderer/src/pit_limiter.rs, dash.rs) draws it. This is what the editor reads to edit it.

import type { DashLayout, DashPage, DashWidget, DashWidgetGroup } from './index'
import { drawnWidgets } from './groups'
import type { GridSpan } from './grid'

/**
 * How the overlay looks: the page's gear widget lit yellow (`gear`; a page without one shows
 * `full`), a yellow frame over the first and last columns and the top row (`box`), or the whole
 * screen yellow with the gear and the speed (`full`, no widgets of its own).
 * A renderer test checks this list against the Rust one.
 */
export type DashPitLimiterStyle = 'gear' | 'box' | 'full'

export const dashPitLimiterStyles: readonly DashPitLimiterStyle[] = ['gear', 'box', 'full']

export const isDashPitLimiterStyle = (value: unknown): value is DashPitLimiterStyle => dashPitLimiterStyles.some((style) => style === value)

/** The style a layout without `pitLimiter` (or with an unknown one) shows. */
export const DEFAULT_PIT_LIMITER_STYLE: DashPitLimiterStyle = 'gear'

/** The layout's pit limiter (`DashLayout.pitLimiter`): its style and its own widgets, on the dash's grid like a page's. */
export interface DashPitLimiter { style: DashPitLimiterStyle; widgets: DashWidget[]; groups?: DashWidgetGroup[] }

/** The layout's pit limiter, or the default one (no widgets) when it has none. */
export const pitLimiterOf = (layout: DashLayout): DashPitLimiter => layout.pitLimiter ?? { style: DEFAULT_PIT_LIMITER_STYLE, widgets: [] }

/**
 * The style `layout` draws in (renderer `PitLimiter::style_on`): the frame needs the dash's own
 * track sizes, so an even-grid dash (an older one) always shows the full screen.
 */
export const pitLimiterStyle = (layout: DashLayout): DashPitLimiterStyle => (layout.colSizes && layout.rowSizes ? pitLimiterOf(layout).style : 'full')

/** Where `page`'s gear widget sits, the one the gear style lights; null when the page draws none. */
export const pageGear = (page: DashPage): GridSpan | null => drawnWidgets(page).find((widget) => widget.type === 'gear') ?? null

/**
 * Where none of the overlay's widgets go in `style` over a page whose gear sits at `gear`
 * (renderer `PitLimiter::draws`): the gear, and the box's frame (the first and last columns and
 * the top row of `layout`'s grid).
 */
export function pitLimiterCovers(layout: DashLayout, style: DashPitLimiterStyle, gear: GridSpan | null): GridSpan[] {
  const covers: GridSpan[] = gear ? [{ col: gear.col, row: gear.row, colSpan: gear.colSpan, rowSpan: gear.rowSpan }] : []
  if (style !== 'box') return covers
  const cols = layout.gridCols
  const rows = layout.gridRows
  return [
    { col: 0, row: 0, colSpan: 1, rowSpan: rows },
    { col: cols - 1, row: 0, colSpan: 1, rowSpan: rows },
    { col: 1, row: 0, colSpan: Math.max(0, cols - 2), rowSpan: 1 },
    ...covers,
  ]
}
