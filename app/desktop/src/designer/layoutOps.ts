import { lapReviewCells, type DashLapReviewField, type DashLayout, type DashPage, type GridSpan } from '@sprint/dashboard'
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

/** A dash's columns or its rows. */
export type TrackAxis = 'cols' | 'rows'

/** The smallest share of the screen a column or row may have. */
export const MIN_TRACK_SHARE = 0.02

const round = (size: number): number => Math.round(size * 100) / 100

/**
 * Moves grid line `line` (1 to the track count - 1: between track `line - 1` and track `line`) to
 * `at`, its place as a share of the side (0–1). Only the two tracks either side change, so every
 * other line stays put, and neither gets below `MIN_TRACK_SHARE`. Null when the dash has no track
 * sizes of its own, the line does not exist or nothing changes.
 */
export function moveGridLine(layout: DashLayout, axis: TrackAxis, line: number, at: number): DashLayout | null {
  const sizes = axis === 'cols' ? layout.colSizes : layout.rowSizes
  if (!sizes || !layout.colSizes || !layout.rowSizes || line < 1 || line >= sizes.length) return null
  const total = sizes.reduce((sum, size) => sum + size, 0)
  const start = sizes.slice(0, line - 1).reduce((sum, size) => sum + size, 0)
  const pair = sizes[line - 1] + sizes[line]
  const min = Math.min(MIN_TRACK_SHARE * total, pair / 2)
  const before = round(Math.min(Math.max(at * total - start, min), pair - min))
  if (before === sizes[line - 1]) return null
  const next = sizes.map((size, index) => (index === line - 1 ? before : index === line ? round(pair - before) : size))
  return axis === 'cols' ? { ...layout, colSizes: next } : { ...layout, rowSizes: next }
}

/** Gives every column (or row) the same share; null when the dash has no track sizes or they already are. */
export function evenTracks(layout: DashLayout, axis: TrackAxis): DashLayout | null {
  const sizes = axis === 'cols' ? layout.colSizes : layout.rowSizes
  if (!sizes || !layout.colSizes || !layout.rowSizes || sizes.every((size) => size === sizes[0])) return null
  const share = round(sizes.reduce((sum, size) => sum + size, 0) / sizes.length)
  const next = sizes.map(() => share)
  return axis === 'cols' ? { ...layout, colSizes: next } : { ...layout, rowSizes: next }
}

/** Puts `field` in the lap review's box `index` (0–5, rows 2 and 3 left to right); null when it is already there. */
export function setLapReviewCell(layout: DashLayout, index: number, field: DashLapReviewField): DashLayout | null {
  const cells = lapReviewCells(layout.lapReview)
  if (index < 0 || index >= cells.length || cells[index] === field) return null
  return { ...layout, lapReview: { cells: cells.map((cell, at) => (at === index ? field : cell)) } }
}

/** Whether the dash sets its own lap review boxes, rather than showing the defaults. */
export const hasOwnLapReview = (layout: DashLayout): boolean => layout.lapReview !== undefined

/** Back to the default lap review boxes; null when the dash already shows them. */
export function resetLapReview(layout: DashLayout): DashLayout | null {
  if (!hasOwnLapReview(layout)) return null
  const { lapReview: _dropped, ...rest } = layout
  return rest
}

/** The page the designer shows for a chosen id: that page while it exists, else the first one (undo can take a page away). */
export const shownPage = (layout: DashLayout, pageId: string): DashPage | null => findPage(layout, pageId) ?? layout.pages[0] ?? layout.idlePage ?? null

const cellsOf = (span: GridSpan): GridSpan[] =>
  Array.from({ length: span.rowSpan }, (_, row) => Array.from({ length: span.colSpan }, (_, col) => ({ col: span.col + col, row: span.row + row, colSpan: 1, rowSpan: 1 }))).flat()

const overlaps = (a: GridSpan, b: GridSpan): boolean => a.col < b.col + b.colSpan && b.col < a.col + a.colSpan && a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan

/** The cells on `page` no widget takes (a hidden one or a stack's other layer still does), for the outline view. */
export function emptyCells(layout: DashLayout, page: DashPage): GridSpan[] {
  const places = cellsOf({ col: 0, row: 0, colSpan: layout.gridCols > 0 ? layout.gridCols : 20, rowSpan: layout.gridRows > 0 ? layout.gridRows : 12 })
  return places.filter((place) => !page.widgets.some((widget) => overlaps(place, widget)))
}

/** Where grid line `line` sits, as a share of the side (0–1); 0 when the dash has no track sizes. */
export function lineShare(layout: DashLayout, axis: TrackAxis, line: number): number {
  const sizes = (axis === 'cols' ? layout.colSizes : layout.rowSizes) ?? []
  const total = sizes.reduce((sum, size) => sum + size, 0)
  return total > 0 ? sizes.slice(0, line).reduce((sum, size) => sum + size, 0) / total : 0
}

/** A track's share of the side, as the designer prints it ("11 %"). */
export function trackPercent(layout: DashLayout, axis: TrackAxis, index: number): string {
  return `${Math.round((lineShare(layout, axis, index + 1) - lineShare(layout, axis, index)) * 100)} %`
}
