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

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

/** Where grid line `edge` of `tracks` falls on a `total`-pixel side. */
function trackEdge(total: number, tracks: readonly number[], edge: number): number {
  const all = sum(tracks)
  if (all <= 0) return 0
  const lines = Math.min(Math.max(edge, 0), tracks.length)
  return Math.round((sum(tracks.slice(0, lines)) * total) / all)
}

/** A dash's own column widths and row heights (`DashLayout.colSizes`/`rowSizes`): shares, only their ratios count. */
export interface Tracks {
  cols: readonly number[]
  rows: readonly number[]
}

/** A span's rectangle in pixels on a dash with its own track sizes (renderer/src/grid.rs `track_rect`). */
export function trackRect(width: number, height: number, tracks: Tracks, span: GridSpan): PixelRect {
  const left = trackEdge(width, tracks.cols, span.col)
  const right = trackEdge(width, tracks.cols, span.col + span.colSpan)
  const top = trackEdge(height, tracks.rows, span.row)
  const bottom = trackEdge(height, tracks.rows, span.row + span.rowSpan)
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
}

/** What the editor needs of a layout's grid: its size in cells and, on a newer dash, its own track sizes. */
export interface LayoutGrid {
  gridCols: number
  gridRows: number
  colSizes?: readonly number[]
  rowSizes?: readonly number[]
}

const evenCols = (grid: LayoutGrid): number => (grid.gridCols > 0 ? grid.gridCols : 20)
const evenRows = (grid: LayoutGrid): number => (grid.gridRows > 0 ? grid.gridRows : 12)

/** The grid's track sizes: its own, else even ones (an older dash). */
export function tracksOf(grid: LayoutGrid): Tracks {
  if (grid.colSizes && grid.rowSizes) return { cols: grid.colSizes, rows: grid.rowSizes }
  return { cols: Array.from({ length: evenCols(grid) }, () => 1), rows: Array.from({ length: evenRows(grid) }, () => 1) }
}

/** A span's rectangle in pixels on `grid`'s canvas, where the renderer places it. */
export function layoutRect(grid: LayoutGrid, width: number, height: number, span: GridSpan): PixelRect {
  return grid.colSizes && grid.rowSizes ? trackRect(width, height, tracksOf(grid), span) : gridRect(width, height, evenCols(grid), evenRows(grid), span)
}

/** Where every grid line falls on a `width` x `height` canvas: the column lines left to right, the row lines top to bottom, both edges included. */
export function gridLines(grid: LayoutGrid, width: number, height: number): { cols: number[]; rows: number[] } {
  const tracks = tracksOf(grid)
  const lines = (sizes: readonly number[], total: number): number[] => Array.from({ length: sizes.length + 1 }, (_, edge) => trackEdge(total, sizes, edge))
  return { cols: lines(tracks.cols, width), rows: lines(tracks.rows, height) }
}

/** The cell under a canvas pixel, clamped into the grid. */
export function cellAt(grid: LayoutGrid, width: number, height: number, x: number, y: number): { col: number; row: number } {
  const lines = gridLines(grid, width, height)
  const index = (edges: number[], at: number): number => {
    for (let line = 1; line < edges.length - 1; line++) {
      if (at < edges[line]) return line - 1
    }
    return edges.length - 2
  }
  return { col: index(lines.cols, x), row: index(lines.rows, y) }
}
