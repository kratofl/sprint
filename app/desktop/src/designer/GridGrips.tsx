import { useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { gridLines, type DashLayout } from '@sprint/dashboard'
import { lineShare, moveGridLine, trackPercent, type TrackAxis } from './layoutOps'
import type { Mutate } from './useDesignerDoc'

/** A grid line being dragged: which one, and where it is now, as a share of the side. */
export type LineDrag = { axis: TrackAxis; line: number; at: number }

/** One arrow press moves a line 1 % of the side; with Shift, 5 %. */
const STEP = 0.01
const BIG_STEP = 0.05

/**
 * A grip on the bezel at every inner grid line of a dash with its own track sizes: along the top
 * for the columns, down the left for the rows. Dragging one moves that line (only the two tracks
 * either side change) and shows the line through the dash with both tracks' shares (so does
 * pointing at or focusing one); release commits it as one undo step. A focused grip moves with
 * the arrow keys. `layout` is the dash as
 * drawn (with `drag` applied), so the grips follow the line.
 */
export function GridGrips({
  layout,
  width,
  height,
  drag,
  onDrag,
  commit,
}: {
  layout: DashLayout
  width: number
  height: number
  drag: LineDrag | null
  onDrag: (drag: LineDrag | null) => void
  commit: (mutate: Mutate, failureMessage: string) => void
}) {
  const [focused, setFocused] = useState<{ axis: TrackAxis; line: number } | null>(null)
  const [pointed, setPointed] = useState<{ axis: TrackAxis; line: number } | null>(null)
  const lines = gridLines(layout, width, height)
  const active = drag ?? focused ?? pointed

  const at = (axis: TrackAxis, event: ReactPointerEvent<HTMLElement>): number => {
    const canvas = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!canvas) return 0
    return axis === 'cols' ? (event.clientX - canvas.left) / width : (event.clientY - canvas.top) / height
  }

  const onKey = (axis: TrackAxis, line: number, event: KeyboardEvent<HTMLElement>): void => {
    const back = axis === 'cols' ? 'ArrowLeft' : 'ArrowUp'
    const forward = axis === 'cols' ? 'ArrowRight' : 'ArrowDown'
    if (event.key !== back && event.key !== forward) return
    event.preventDefault()
    event.stopPropagation()
    const step = (event.shiftKey ? BIG_STEP : STEP) * (event.key === back ? -1 : 1)
    commit((current) => moveGridLine(current, axis, line, lineShare(current, axis, line) + step), "That column or row can't get any smaller.")
  }

  const grip = (axis: TrackAxis, line: number, position: number) => {
    const isActive = active?.axis === axis && active.line === line
    const noun = axis === 'cols' ? 'column' : 'row'
    return (
      <span
        key={`${axis}${line}`}
        role="separator"
        tabIndex={0}
        aria-orientation={axis === 'cols' ? 'vertical' : 'horizontal'}
        aria-label={`Line between ${noun} ${line} and ${noun} ${line + 1}`}
        aria-valuenow={Math.round(lineShare(layout, axis, line) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`designer-grid-grip is-${axis}${isActive ? ' is-active' : ''}`}
        style={axis === 'cols' ? { left: position } : { top: position }}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          onDrag({ axis, line, at: at(axis, event) })
        }}
        onPointerMove={(event) => {
          if (drag?.axis === axis && drag.line === line) onDrag({ axis, line, at: at(axis, event) })
        }}
        onPointerUp={(event) => {
          if (drag?.axis !== axis || drag.line !== line) return
          const to = at(axis, event)
          onDrag(null)
          commit((current) => moveGridLine(current, axis, line, to), "That column or row can't get any smaller.")
        }}
        onPointerCancel={() => onDrag(null)}
        onPointerOver={() => setPointed({ axis, line })}
        onPointerLeave={() => setPointed(null)}
        onFocus={() => setFocused({ axis, line })}
        onBlur={() => setFocused(null)}
        onKeyDown={(event) => onKey(axis, line, event)}
      >
        <GripVertical size={10} aria-hidden="true" />
      </span>
    )
  }

  const tags = (axis: TrackAxis, line: number) => {
    const edges = axis === 'cols' ? lines.cols : lines.rows
    return [line - 1, line].map((index) => {
      const from = edges[index]
      const size = edges[index + 1] - from
      return (
        <span key={`${axis}tag${index}`} className={`designer-grid-share is-${axis}`} style={axis === 'cols' ? { left: from, width: size } : { top: from, height: size }}>
          {trackPercent(layout, axis, index)}
        </span>
      )
    })
  }

  return (
    <>
      {lines.cols.slice(1, -1).map((x, index) => grip('cols', index + 1, x))}
      {lines.rows.slice(1, -1).map((y, index) => grip('rows', index + 1, y))}
      {active && (
        <>
          <span
            className={`designer-grid-line is-${active.axis}`}
            style={active.axis === 'cols' ? { left: lines.cols[active.line] - 1 } : { top: lines.rows[active.line] - 1 }}
            aria-hidden="true"
          />
          {tags(active.axis, active.line)}
        </>
      )}
    </>
  )
}
