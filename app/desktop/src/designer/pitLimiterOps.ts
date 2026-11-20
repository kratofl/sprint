import { DASH_ZONES, pitLimiterBars, pitLimiterCovers, pitLimiterOf, pitLimiterStyle } from '@sprint/dashboard'
import type { DashLayout, DashPage, DashPageBars, DashPitLimiter, DashPitLimiterStyle, DashWidget } from '@sprint/dashboard'
import { nextId, pageIdTaken, rectsIntersect } from '../views/DashesDomain'
import type { Mutate } from './useDesignerDoc'

/**
 * The pit limiter's edits (the Pit limiter section). Its own widgets are edited with the Layout
 * section's tools: those work on a page, so the overlay is handed to them as a one-page layout
 * (`pitLimiterView`) and every edit they make is written back into `pitLimiter`
 * (`onPitLimiter`). Same contract as the other designer ops: a new layout, or null when the edit
 * is not possible.
 */

/** The id of the page the overlay is edited as. */
export const PIT_LIMITER_PAGE_ID = 'pit-limiter'

// Hidden stand-ins holding the spots the style's yellow covers, so nothing is placed or moved
// there. Never saved: a widget id never starts with an underscore (`slugify`).
const COVER_PREFIX = '__covered-'
const isCover = (widget: DashWidget): boolean => widget.id.startsWith(COVER_PREFIX)

/**
 * Whether one of the overlay's own widgets sits where the style's yellow covers: one placed in a
 * bar spot under the gear style before the box was picked. The box does not draw it, and in the
 * view it would collide with the stand-ins, so the view leaves it out and every edit keeps it.
 */
const underCover = (layout: DashLayout) => {
  const covers = pitLimiterCovers(pitLimiterStyle(layout)).map((zone) => DASH_ZONES[zone])
  return (widget: DashWidget): boolean => covers.some((zone) => rectsIntersect(zone, widget))
}

/**
 * The overlay as a one-page layout for the Layout tools, over a page keeping `pageBars`: its
 * widgets and groups on the overlay's own grid (`pitLimiterBars`), and a hidden stand-in in every
 * spot its yellow covers (its widgets already there left out: `underCover`).
 */
export function pitLimiterView(layout: DashLayout, pageBars: DashPageBars | undefined): DashLayout {
  const style = pitLimiterStyle(layout)
  const pit = pitLimiterOf(layout)
  const covered = underCover(layout)
  const covers: DashWidget[] = pitLimiterCovers(style).map((zone) => ({ id: `${COVER_PREFIX}${zone}`, type: 'bar', ...DASH_ZONES[zone], hidden: true }))
  const page: DashPage = { id: PIT_LIMITER_PAGE_ID, name: 'Pit limiter', widgets: [...covers, ...pit.widgets.filter((widget) => !covered(widget))] }
  if (pit.groups && pit.groups.length > 0) page.groups = pit.groups
  const bars = pitLimiterBars(style, pageBars)
  if (bars !== undefined && bars !== 'both') page.bars = bars
  return { ...layout, pages: [page], idlePage: null }
}

/**
 * `layout` with the overlay's widgets and groups as `view` (a `pitLimiterView` after an edit) has
 * them, and the widgets the view left out back in front: on the page if their group went, under a
 * fresh id if the edit took theirs.
 */
function withViewPage(layout: DashLayout, view: DashLayout): DashLayout | null {
  const page = view.pages.find((candidate) => candidate.id === PIT_LIMITER_PAGE_ID)
  if (!page) return null
  const edited: DashPage = { ...page, widgets: page.widgets.filter((widget) => !isCover(widget)) }
  const kept: DashWidget[] = []
  for (const widget of pitLimiterOf(layout).widgets.filter(underCover(layout))) {
    const id = nextId(widget.id, (candidate) => pageIdTaken(edited, candidate) || kept.some((other) => other.id === candidate))
    const { group, ...loose } = widget
    const back = group !== undefined && (page.groups ?? []).some((candidate) => candidate.id === group) ? widget : loose
    kept.push({ ...back, id })
  }
  const pitLimiter: DashPitLimiter = { style: pitLimiterOf(layout).style, widgets: [...kept, ...edited.widgets] }
  if (page.groups && page.groups.length > 0) pitLimiter.groups = page.groups
  return { ...layout, pitLimiter }
}

/** A Layout edit made on the overlay's view (over a page keeping `pageBars`), as an edit of the layout. */
export const onPitLimiter =
  (mutate: Mutate, pageBars: DashPageBars | undefined): Mutate =>
  (current) => {
    const next = mutate(pitLimiterView(current, pageBars))
    return next ? withViewPage(current, next) : null
  }

/** Picks the overlay's style; its widgets stay (the full screen just does not show them). Null when already picked. */
export function setPitLimiterStyle(layout: DashLayout, style: DashPitLimiterStyle): DashLayout | null {
  const pit = pitLimiterOf(layout)
  if (pit.style === style) return null
  return { ...layout, pitLimiter: { ...pit, style } }
}

/** Whether the overlay has widgets of its own. */
export const hasPitLimiterWidgets = (layout: DashLayout): boolean => pitLimiterOf(layout).widgets.length > 0

/** Takes every widget (and group) off the overlay; null when it has none. */
export function clearPitLimiterWidgets(layout: DashLayout): DashLayout | null {
  if (!hasPitLimiterWidgets(layout)) return null
  return { ...layout, pitLimiter: { style: pitLimiterOf(layout).style, widgets: [] } }
}
