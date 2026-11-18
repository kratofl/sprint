// Pure grid math: where a widget's grid span lands on a pixel canvas. The Rust renderer places
// widgets with the same math (renderer/src/grid.rs, tests ported from grid.test.ts); the editor
// positions its selection and drag overlay with this copy, so the two line up to the pixel.

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
 * A zoned layout's fixed tracks, in pixels at 800x480 (renderer/src/grid.rs `ZONE_COLS`/`ZONE_ROWS`):
 * the left bar spot, the left grid's four columns, the centre column, the right grid's four and the
 * right bar spot; the top bar spot, then eight rows. Every zoned dash keeps these proportions.
 */
export const ZONE_COLS: readonly number[] = [40, 68, 68, 68, 68, 176, 68, 68, 68, 68, 40]
export const ZONE_ROWS: readonly number[] = [36, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5, 55.5]

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

/** Where grid line `edge` of `tracks` falls on a `total`-pixel side. */
function trackEdge(total: number, tracks: readonly number[], edge: number): number {
  const lines = Math.min(Math.max(edge, 0), tracks.length)
  return Math.round((sum(tracks.slice(0, lines)) * total) / sum(tracks))
}

/** A widget's rectangle in pixels on a zoned layout. */
export function zonedRect(width: number, height: number, span: GridSpan): PixelRect {
  const left = trackEdge(width, ZONE_COLS, span.col)
  const right = trackEdge(width, ZONE_COLS, span.col + span.colSpan)
  const top = trackEdge(height, ZONE_ROWS, span.row)
  const bottom = trackEdge(height, ZONE_ROWS, span.row + span.rowSpan)
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** What the editor needs of a layout's grid: zoned or even, and its size in cells. */
export interface LayoutGrid {
  zoned?: boolean
  gridCols: number
  gridRows: number
}

const evenCols = (grid: LayoutGrid): number => (grid.gridCols > 0 ? grid.gridCols : 20)
const evenRows = (grid: LayoutGrid): number => (grid.gridRows > 0 ? grid.gridRows : 12)

/** A span's rectangle in pixels on `grid`'s canvas, where the renderer places it. */
export function layoutRect(grid: LayoutGrid, width: number, height: number, span: GridSpan): PixelRect {
  return grid.zoned ? zonedRect(width, height, span) : gridRect(width, height, evenCols(grid), evenRows(grid), span)
}

/** The cell under a canvas pixel, clamped into the grid. */
export function cellAt(grid: LayoutGrid, width: number, height: number, x: number, y: number): { col: number; row: number } {
  if (!grid.zoned) {
    const cols = evenCols(grid)
    const rows = evenRows(grid)
    return { col: Math.min(Math.max(Math.floor((x * cols) / width), 0), cols - 1), row: Math.min(Math.max(Math.floor((y * rows) / height), 0), rows - 1) }
  }
  const index = (tracks: readonly number[], total: number, at: number): number => {
    for (let line = 1; line < tracks.length; line++) {
      if (at < trackEdge(total, tracks, line)) return line - 1
    }
    return tracks.length - 1
  }
  return { col: index(ZONE_COLS, width, x), row: index(ZONE_ROWS, height, y) }
}
