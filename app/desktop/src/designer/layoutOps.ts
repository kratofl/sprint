import { DASH_ZONES, type DashLayout, type DashPage, type GridSpan } from '@sprint/dashboard'
import { findPage } from '../views/DashesDomain'

/**
 * Page edits the designer needs on top of the `DashesDomain` mutators (group edits are in
 * `groupOps.ts`). Same contract: a new layout, or null when the edit is not possible.
 */

/** Moves a regular page one place earlier (-1) or later (1) in the page order. The idle page has no place in it. */
export function movePage(layout: DashLayout, pageId: string, offset: -1 | 1): DashLayout | null {
  const index = layout.pages.findIndex((page) => page.id === pageId)
  const target = index + offset
  if (index < 0 || target < 0 || target >= layout.pages.length) return null
  const pages = [...layout.pages]
  const [page] = pages.splice(index, 1)
  pages.splice(target, 0, page)
  return { ...layout, pages }
}

/** The page the designer shows for a chosen id: that page while it exists, else the first one (undo can take a page away). */
export const shownPage = (layout: DashLayout, pageId: string): DashPage | null => findPage(layout, pageId) ?? layout.pages[0] ?? layout.idlePage ?? null

const cellsOf = (span: GridSpan): GridSpan[] =>
  Array.from({ length: span.rowSpan }, (_, row) => Array.from({ length: span.colSpan }, (_, col) => ({ col: span.col + col, row: span.row + row, colSpan: 1, rowSpan: 1 }))).flat()

const overlaps = (a: GridSpan, b: GridSpan): boolean => a.col < b.col + b.colSpan && b.col < a.col + a.colSpan && a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan

/**
 * The places on `page` no widget takes (a hidden one or a stack's other layer still does), for the
 * outline view: on a zoned dash each side bar spot whole and every other free cell alone, on a
 * free grid every free cell.
 */
export function emptyCells(layout: DashLayout, page: DashPage): GridSpan[] {
  const places = layout.zoned
    ? [DASH_ZONES.barLeft, DASH_ZONES.barRight, ...cellsOf(DASH_ZONES.top), ...cellsOf(DASH_ZONES.left), ...cellsOf(DASH_ZONES.centre), ...cellsOf(DASH_ZONES.right)]
    : cellsOf({ col: 0, row: 0, colSpan: layout.gridCols > 0 ? layout.gridCols : 20, rowSpan: layout.gridRows > 0 ? layout.gridRows : 12 })
  return places.filter((place) => !page.widgets.some((widget) => overlaps(place, widget)))
}
