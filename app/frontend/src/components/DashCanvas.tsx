import { useRef, useState, useEffect, useCallback } from 'react'
import { cn } from '@sprint/ui'
import { type DashWidget, WIDGET_TYPES } from '@/lib/dash'

export const DEFAULT_SCREEN_W = 800
export const DEFAULT_SCREEN_H = 480

const DEFAULT_GRID_COLS = 20
const DEFAULT_GRID_ROWS = 12

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface ActiveResize {
  widgetIdx: number
  handle: ResizeHandle
  startWidget: DashWidget
}

interface ActiveMove {
  widgetIdx: number
  grabOffsetCol: number
  grabOffsetRow: number
  startWidget: DashWidget
}

interface Ghost {
  col: number
  row: number
  colSpan: number
  rowSpan: number
  valid: boolean
}

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: 'nw-resize', n: 'n-resize',  ne: 'ne-resize',
  e:  'e-resize',                   w:  'w-resize',
  sw: 'sw-resize', s: 's-resize',  se: 'se-resize',
}

const HANDLE_OFFSETS: Record<ResizeHandle, [string, string]> = {
  nw: ['0%',   '0%'  ], n: ['50%',  '0%'  ], ne: ['100%', '0%'  ],
  w:  ['0%',   '50%' ],                        e: ['100%', '50%'  ],
  sw: ['0%',   '100%'], s: ['50%',  '100%'], se: ['100%', '100%'],
}

const ALL_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function widgetLabel(type: string): string {
  return WIDGET_TYPES.find(w => w.type === type)?.label ?? type
}

function overlaps(
  a: { col: number; row: number; colSpan: number; rowSpan: number },
  b: { col: number; row: number; colSpan: number; rowSpan: number },
): boolean {
  return (
    a.col < b.col + b.colSpan && a.col + a.colSpan > b.col &&
    a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row
  )
}

function isValidPlacement(
  p: { col: number; row: number; colSpan: number; rowSpan: number },
  widgets: DashWidget[],
  excludeIdx: number | null,
  cols: number,
  rows: number,
): boolean {
  if (p.col < 0 || p.row < 0 || p.col + p.colSpan > cols || p.row + p.rowSpan > rows) return false
  return widgets.every((w, i) => i === excludeIdx || !overlaps(p, w))
}

export interface DashCanvasProps {
  widgets: DashWidget[]
  selectedId: number | null
  gridCols?: number
  gridRows?: number
  screenW?: number
  screenH?: number
  paletteDropType?: string | null
  onSelect: (id: number | null) => void
  onUpdate: (widgets: DashWidget[]) => void
}

export function DashCanvas({
  widgets,
  gridCols = DEFAULT_GRID_COLS,
  gridRows = DEFAULT_GRID_ROWS,
  selectedId,
  screenW = DEFAULT_SCREEN_W,
  screenH = DEFAULT_SCREEN_H,
  paletteDropType = null,
  onSelect,
  onUpdate,
}: DashCanvasProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const widgetsRef    = useRef(widgets)
  widgetsRef.current  = widgets

  const [activeResize, setActiveResize] = useState<ActiveResize | null>(null)
  const [activeMove,   setActiveMove]   = useState<ActiveMove   | null>(null)
  const [ghost,        setGhost]        = useState<Ghost        | null>(null)

  const gridPos = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { col: 0, row: 0 }
    const r = containerRef.current.getBoundingClientRect()
    return {
      col: (clientX - r.left) / r.width  * gridCols,
      row: (clientY - r.top)  / r.height * gridRows,
    }
  }, [gridCols, gridRows])

  // ── Resize ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeResize) return
    const { widgetIdx, handle, startWidget } = activeResize
    const right  = startWidget.col + startWidget.colSpan
    const bottom = startWidget.row + startWidget.rowSpan

    const onMouseMove = (e: MouseEvent) => {
      const { col: rawCol, row: rawRow } = gridPos(e.clientX, e.clientY)
      const col = Math.round(rawCol)
      const row = Math.round(rawRow)

      const w = { ...startWidget }
      if (handle.includes('e')) w.colSpan = Math.max(1, col - w.col)
      if (handle.includes('s')) w.rowSpan = Math.max(1, row - w.row)
      if (handle.includes('w')) { w.col = Math.max(0, Math.min(col, right - 1)); w.colSpan = right - w.col }
      if (handle.includes('n')) { w.row = Math.max(0, Math.min(row, bottom - 1)); w.rowSpan = bottom - w.row }
      w.col     = Math.max(0, w.col)
      w.row     = Math.max(0, w.row)
      w.colSpan = Math.max(1, Math.min(w.colSpan, gridCols - w.col))
      w.rowSpan = Math.max(1, Math.min(w.rowSpan, gridRows - w.row))

      const valid = isValidPlacement(w, widgetsRef.current, widgetIdx, gridCols, gridRows)
      setGhost({ col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan, valid })
      onUpdate(widgetsRef.current.map((ww, i) => (i === widgetIdx ? w : ww)))
    }

    const onMouseUp = () => {
      // If the final position overlaps another widget, revert to start
      const cur = widgetsRef.current[widgetIdx]
      if (cur && !isValidPlacement(cur, widgetsRef.current, widgetIdx, gridCols, gridRows)) {
        onUpdate(widgetsRef.current.map((ww, i) => (i === widgetIdx ? startWidget : ww)))
      }
      setActiveResize(null)
      setGhost(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  // widgetsRef.current is used intentionally to avoid re-registering on every frame
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResize, gridCols, gridRows, onUpdate, gridPos])

  // ── Move (mouse-based — no HTML5 drag ghost) ────────────────────────────────
  useEffect(() => {
    if (!activeMove) return
    const { widgetIdx, grabOffsetCol, grabOffsetRow, startWidget } = activeMove

    const onMouseMove = (e: MouseEvent) => {
      const { col, row } = gridPos(e.clientX, e.clientY)
      const snapCol  = Math.max(0, Math.min(Math.round(col - grabOffsetCol), gridCols - startWidget.colSpan))
      const snapRow  = Math.max(0, Math.min(Math.round(row - grabOffsetRow), gridRows - startWidget.rowSpan))
      const proposed = { ...startWidget, col: snapCol, row: snapRow }
      const valid    = isValidPlacement(proposed, widgetsRef.current, widgetIdx, gridCols, gridRows)
      setGhost({ col: snapCol, row: snapRow, colSpan: startWidget.colSpan, rowSpan: startWidget.rowSpan, valid })
    }

    const onMouseUp = (e: MouseEvent) => {
      const { col, row } = gridPos(e.clientX, e.clientY)
      const snapCol  = Math.max(0, Math.min(Math.round(col - grabOffsetCol), gridCols - startWidget.colSpan))
      const snapRow  = Math.max(0, Math.min(Math.round(row - grabOffsetRow), gridRows - startWidget.rowSpan))
      const proposed = { ...startWidget, col: snapCol, row: snapRow }
      if (isValidPlacement(proposed, widgetsRef.current, widgetIdx, gridCols, gridRows)) {
        onUpdate(widgetsRef.current.map((w, i) => (i === widgetIdx ? proposed : w)))
      }
      setActiveMove(null)
      setGhost(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMove, gridCols, gridRows, onUpdate, gridPos])

  // ── Palette drop ──────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!paletteDropType) return
    e.dataTransfer.dropEffect = 'copy'
    const meta    = WIDGET_TYPES.find(wt => wt.type === paletteDropType)
    const colSpan = meta?.defaultColSpan ?? 4
    const rowSpan = meta?.defaultRowSpan ?? 2
    const { col, row } = gridPos(e.clientX, e.clientY)
    const snapCol  = Math.max(0, Math.min(Math.floor(col), gridCols - colSpan))
    const snapRow  = Math.max(0, Math.min(Math.floor(row), gridRows - rowSpan))
    const proposed = { col: snapCol, row: snapRow, colSpan, rowSpan }
    setGhost({ ...proposed, valid: isValidPlacement(proposed, widgetsRef.current, null, gridCols, gridRows) })
  }, [paletteDropType, gridCols, gridRows, gridPos])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setGhost(null)
    const widgetType = e.dataTransfer.getData('widget-type')
    if (!widgetType) return
    const meta    = WIDGET_TYPES.find(wt => wt.type === widgetType)
    const colSpan = meta?.defaultColSpan ?? 4
    const rowSpan = meta?.defaultRowSpan ?? 2
    const { col, row } = gridPos(e.clientX, e.clientY)
    const snapCol  = Math.max(0, Math.min(Math.floor(col), gridCols - colSpan))
    const snapRow  = Math.max(0, Math.min(Math.floor(row), gridRows - rowSpan))
    const proposed = { col: snapCol, row: snapRow, colSpan, rowSpan }
    if (!isValidPlacement(proposed, widgetsRef.current, null, gridCols, gridRows)) return
    const newWidget: DashWidget = { id: crypto.randomUUID(), type: widgetType, ...proposed }
    const updated = [...widgetsRef.current, newWidget]
    onUpdate(updated)
    onSelect(updated.length - 1)
  }, [gridCols, gridRows, onUpdate, onSelect, gridPos])

  const isDragging = activeMove !== null || activeResize !== null

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded bg-[#0a0a0a] border border-white/10"
      style={{
        aspectRatio: `${screenW} / ${screenH}`,
        backgroundImage: [
          'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px)',
          'linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: `${100 / gridCols}% ${100 / gridRows}%`,
        cursor: activeMove ? 'grabbing' : undefined,
      }}
      onDragOver={handleDragOver}
      onDragLeave={() => setGhost(null)}
      onDrop={handleDrop}
      onClick={() => { if (!isDragging) onSelect(null) }}
    >

      <span className="pointer-events-none absolute bottom-1.5 right-2 font-mono text-[10px] text-white/20">
        {screenW}×{screenH}
      </span>

      {/* Drop / move / resize ghost */}
      {ghost && (
        <div
          className="pointer-events-none absolute rounded"
          style={{
            left:       `${(ghost.col     / gridCols) * 100}%`,
            top:        `${(ghost.row     / gridRows) * 100}%`,
            width:      `${(ghost.colSpan / gridCols) * 100}%`,
            height:     `${(ghost.rowSpan / gridRows) * 100}%`,
            zIndex:     50,
            border:     `2px dashed ${ghost.valid ? 'var(--accent)' : '#F87171'}`,
            background:  ghost.valid ? 'rgba(255,144,108,0.12)' : 'rgba(248,113,113,0.12)',
          }}
        />
      )}

      {widgets.map((widget, idx) => {
        const isSelected   = selectedId === idx
        const isBeingMoved = activeMove?.widgetIdx === idx

        return (
          <div
            key={idx}
            className="absolute"
            style={{
              left:    `${(widget.col     / gridCols) * 100}%`,
              top:     `${(widget.row     / gridRows) * 100}%`,
              width:   `${(widget.colSpan / gridCols) * 100}%`,
              height:  `${(widget.rowSpan / gridRows) * 100}%`,
              zIndex:  isSelected ? 10 : undefined,
              opacity: isBeingMoved ? 0.2 : 1,
            }}
            onClick={e => { e.stopPropagation(); if (!isDragging) onSelect(idx) }}
          >
            <div
              onMouseDown={e => {
                if (e.button !== 0 || activeResize) return
                e.preventDefault()
                e.stopPropagation()
                const { col, row } = gridPos(e.clientX, e.clientY)
                setActiveMove({
                  widgetIdx: idx,
                  grabOffsetCol: col - widget.col,
                  grabOffsetRow: row - widget.row,
                  startWidget: { ...widget },
                })
                onSelect(idx)
              }}
              className={cn(
                'absolute inset-0 flex flex-col items-start justify-start overflow-hidden rounded select-none border',
                activeMove ? 'cursor-grabbing' : 'cursor-grab',
                isSelected
                  ? 'bg-white/8 border-accent ring-1 ring-accent/30'
                  : 'bg-white/5 border-white/10 hover:border-white/20',
              )}
            >
              <span className="w-full truncate px-1 pt-0.5 font-mono text-[9px] uppercase leading-none tracking-wide text-white/40">
                {widgetLabel(widget.type)}
              </span>
            </div>

            {isSelected && ALL_HANDLES.map(handle => {
              const [hLeft, hTop] = HANDLE_OFFSETS[handle]
              return (
                <div
                  key={handle}
                  onMouseDown={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    setActiveResize({ widgetIdx: idx, handle, startWidget: { ...widget } })
                  }}
                  style={{
                    position:     'absolute',
                    left:         hLeft,
                    top:          hTop,
                    transform:    'translate(-50%, -50%)',
                    width:        8,
                    height:       8,
                    background:   'var(--accent)',
                    border:       '1px solid black',
                    borderRadius: 1,
                    cursor:       HANDLE_CURSORS[handle],
                    zIndex:       20,
                  }}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
