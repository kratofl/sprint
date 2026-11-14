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
