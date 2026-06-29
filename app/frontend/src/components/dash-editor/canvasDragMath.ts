// Pure grid drag/resize math extracted from DashCanvas.tsx.
//
// The same clamp arithmetic was inlined up to four times across the canvas's
// mouse-driven resize/move effects (widget + overlay, mousemove + mouseup),
// which made it the worst Edit-unique-string hazard in the file. These pure
// helpers are the single source of that math so the effects only orchestrate
// pointer state. Callers merge the returned geometry onto their own concrete
// shape, e.g. `{ ...startWidget, ...resolveResizeGeom(...) }`, so widget/overlay
// extra fields (id, type, …) are preserved without generics.

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface GridGeom {
  col: number
  row: number
  colSpan: number
  rowSpan: number
}

/**
 * Resolve the clamped geometry while dragging a resize handle.
 *
 * `pointerCol`/`pointerRow` are raw (fractional) grid coordinates from
 * `gridPos`; they are rounded internally to whole cells. Edges grow/shrink with
 * a minimum span of 1, the west/north edges are pinned so they never cross the
 * opposite (right/bottom) edge, and the final rect is clamped inside the grid.
 */
export function resolveResizeGeom(
  start: GridGeom,
  handle: ResizeHandle,
  pointerCol: number,
  pointerRow: number,
  gridCols: number,
  gridRows: number,
): GridGeom {
  const right = start.col + start.colSpan
  const bottom = start.row + start.rowSpan
  const col = Math.round(pointerCol)
  const row = Math.round(pointerRow)

  let nextCol = start.col
  let nextRow = start.row
  let nextColSpan = start.colSpan
  let nextRowSpan = start.rowSpan

  if (handle.includes('e')) nextColSpan = Math.max(1, col - nextCol)
  if (handle.includes('s')) nextRowSpan = Math.max(1, row - nextRow)
  if (handle.includes('w')) { nextCol = Math.max(0, Math.min(col, right - 1)); nextColSpan = right - nextCol }
  if (handle.includes('n')) { nextRow = Math.max(0, Math.min(row, bottom - 1)); nextRowSpan = bottom - nextRow }

  nextCol = Math.max(0, nextCol)
  nextRow = Math.max(0, nextRow)
  nextColSpan = Math.max(1, Math.min(nextColSpan, gridCols - nextCol))
  nextRowSpan = Math.max(1, Math.min(nextRowSpan, gridRows - nextRow))

  return { col: nextCol, row: nextRow, colSpan: nextColSpan, rowSpan: nextRowSpan }
}

/**
 * Resolve the snapped geometry while moving a rect by its grab offset.
 *
 * `pointerCol`/`pointerRow` are raw grid coordinates; the resulting top-left is
 * rounded and clamped so the rect stays fully inside the grid. Span is
 * unchanged.
 */
export function resolveMoveGeom(
  start: GridGeom,
  grabOffsetCol: number,
  grabOffsetRow: number,
  pointerCol: number,
  pointerRow: number,
  gridCols: number,
  gridRows: number,
): GridGeom {
  const snapCol = Math.max(0, Math.min(Math.round(pointerCol - grabOffsetCol), gridCols - start.colSpan))
  const snapRow = Math.max(0, Math.min(Math.round(pointerRow - grabOffsetRow), gridRows - start.rowSpan))
  return { col: snapCol, row: snapRow, colSpan: start.colSpan, rowSpan: start.rowSpan }
}
