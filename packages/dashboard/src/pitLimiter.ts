// The pit limiter overlay: what a dash shows over its page while the pit limiter is on (and the
// app-wide `pit_limiter` alert is on). The layout's `pitLimiter` picks the look and holds the
// overlay's own widgets, placed on an empty copy of the zoned grid; the Rust renderer
// (renderer/src/pit_limiter.rs, dash.rs) draws it. This is what the editor reads to edit it.

import type { DashLayout, DashWidget, DashWidgetGroup } from './index'
import type { DashPageBars, DashZone } from './zones'

/**
 * How the overlay looks: the gear's box lit yellow (`gear`), a yellow frame over the bar spots
 * (`box`), or the whole screen yellow with the gear and the speed (`full`, no widgets of its own).
 * A renderer test checks this list against the Rust one.
 */
export type DashPitLimiterStyle = 'gear' | 'box' | 'full'

export const dashPitLimiterStyles: readonly DashPitLimiterStyle[] = ['gear', 'box', 'full']

export const isDashPitLimiterStyle = (value: unknown): value is DashPitLimiterStyle => dashPitLimiterStyles.some((style) => style === value)

/** The style a layout without `pitLimiter` (or with an unknown one) shows. */
export const DEFAULT_PIT_LIMITER_STYLE: DashPitLimiterStyle = 'gear'

/** The layout's pit limiter (`DashLayout.pitLimiter`): its style and its own widgets, on the zoned grid like a page's. */
export interface DashPitLimiter { style: DashPitLimiterStyle; widgets: DashWidget[]; groups?: DashWidgetGroup[] }

/** The layout's pit limiter, or the default one (no widgets) when it has none. */
export const pitLimiterOf = (layout: DashLayout): DashPitLimiter => layout.pitLimiter ?? { style: DEFAULT_PIT_LIMITER_STYLE, widgets: [] }

/**
 * The style `layout` draws in (renderer `PitLimiter::style_on`): the gear and the bar spots exist
 * only on a zoned dash, so an even-grid dash always shows the full screen.
 */
export const pitLimiterStyle = (layout: DashLayout): DashPitLimiterStyle => (layout.zoned ? pitLimiterOf(layout).style : 'full')

/**
 * The bar spots the overlay's own grid keeps over a page keeping `pageBars` (renderer
 * `PitLimiter::grid_bars`): the box always covers all three where they would be, so its widgets
 * sit on the full grid; the gear follows the page, landing on the page's gear and cells.
 */
export const pitLimiterBars = (style: DashPitLimiterStyle, pageBars: DashPageBars | undefined): DashPageBars | undefined => (style === 'box' ? 'both' : pageBars)

/** The zones the style's yellow covers, where none of its widgets go (renderer `PitLimiter::draws`; the gear is never anyone's). */
export const pitLimiterCovers = (style: DashPitLimiterStyle): readonly DashZone[] => (style === 'box' ? ['barLeft', 'barRight', 'top'] : [])
