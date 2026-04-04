import { useRef, useCallback, useState, useEffect } from 'react'
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

export interface DashCanvasProps {
  widgets: DashWidget[]
  selectedId: number | null
  gridCols?: number
  gridRows?: number
  screenW?: number
  screenH?: number
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
  onSelect,
  onUpdate,
}: DashCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeResize, setActiveResize] = useState<ActiveResize | null>(null)

  useEffect(() => {
    if (!activeResize) return
    const { widgetIdx, handle, startWidget } = activeResize
    const right  = startWidget.col + startWidget.colSpan
    const bottom = startWidget.row + startWidget.rowSpan

    const onMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const col  = Math.round((e.clientX - rect.left) / rect.width  * gridCols)
      const row  = Math.round((e.clientY - rect.top)  / rect.height * gridRows)

      const w = { ...startWidget }
      if (handle.includes('e')) w.colSpan = Math.max(1, col - w.col)
      if (handle.includes('s')) w.rowSpan = Math.max(1, row - w.row)
      if (handle.includes('w')) { w.col = Math.max(0, Math.min(col, right - 1)); w.colSpan = right - w.col }
      if (handle.includes('n')) { w.row = Math.max(0, Math.min(row, bottom - 1)); w.rowSpan = bottom - w.row }

      w.col     = Math.max(0, w.col)
      w.row     = Math.max(0, w.row)
      w.colSpan = Math.max(1, Math.min(w.colSpan, gridCols - w.col))
      w.rowSpan = Math.max(1, Math.min(w.rowSpan, gridRows - w.row))

      onUpdate(widgets.map((ww, i) => (i === widgetIdx ? w : ww)))
    }

    const onMouseUp = () => setActiveResize(null)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [activeResize, widgets, gridCols, gridRows, onUpdate])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy'
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()

      const moveIdx = e.dataTransfer.getData('move-idx')
      if (moveIdx) {
        const idx           = parseInt(moveIdx, 10)
        const grabOffsetCol = parseFloat(e.dataTransfer.getData('grab-offset-col') || '0')
        const grabOffsetRow = parseFloat(e.dataTransfer.getData('grab-offset-row') || '0')
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const col  = (e.clientX - rect.left) / rect.width  * gridCols - grabOffsetCol
        const row  = (e.clientY - rect.top)  / rect.height * gridRows - grabOffsetRow
        const w    = widgets[idx]
        onUpdate(widgets.map((ww, i) =>
          i === idx
            ? {
                ...ww,
                col: Math.max(0, Math.min(Math.round(col), gridCols - w.colSpan)),
                row: Math.max(0, Math.min(Math.round(row), gridRows - w.rowSpan)),
              }
            : ww,
        ))
        return
      }

      const widgetType = e.dataTransfer.getData('widget-type')
      if (!widgetType) return

      const meta           = WIDGET_TYPES.find(wt => wt.type === widgetType)
      const defaultColSpan = meta?.defaultColSpan ?? 4
      const defaultRowSpan = meta?.defaultRowSpan ?? 2
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const col  = Math.floor((e.clientX - rect.left) / rect.width  * gridCols)
      const row  = Math.floor((e.clientY - rect.top)  / rect.height * gridRows)

      const newWidget: DashWidget = {
        id:      crypto.randomUUID(),
        type:    widgetType,
        col:     Math.max(0, Math.min(col, gridCols - defaultColSpan)),
        row:     Math.max(0, Math.min(row, gridRows - defaultRowSpan)),
        colSpan: defaultColSpan,
        rowSpan: defaultRowSpan,
      }
      const updated = [...widgets, newWidget]
      onUpdate(updated)
      onSelect(updated.length - 1)
    },
    [widgets, gridCols, gridRows, onUpdate, onSelect],
  )

  const handleWidgetDragStart = useCallback(
    (e: React.DragEvent, idx: number) => {
      const widget = widgets[idx]
      if (!containerRef.current) return
      const rect          = containerRef.current.getBoundingClientRect()
      const grabOffsetCol = (e.clientX - rect.left) / rect.width  * gridCols - widget.col
      const grabOffsetRow = (e.clientY - rect.top)  / rect.height * gridRows - widget.row
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('move-idx',        String(idx))
      e.dataTransfer.setData('grab-offset-col', String(grabOffsetCol))
      e.dataTransfer.setData('grab-offset-row', String(grabOffsetRow))
      onSelect(idx)
    },
    [widgets, gridCols, gridRows, onSelect],
  )

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
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => onSelect(null)}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 opacity-20"
        style={{
          height: 80,
          background: 'radial-gradient(ellipse 60% 80px at 50% 0, var(--accent) 0%, transparent 100%)',
        }}
      />

      <span className="pointer-events-none absolute bottom-1.5 right-2 font-mono text-[10px] text-white/20">
        {screenW}×{screenH}
      </span>

      {widgets.map((widget, idx) => {
        const isSelected = selectedId === idx
        const left   = `${(widget.col     / gridCols) * 100}%`
        const top    = `${(widget.row     / gridRows) * 100}%`
        const width  = `${(widget.colSpan / gridCols) * 100}%`
        const height = `${(widget.rowSpan / gridRows) * 100}%`

        return (
          <div
            key={idx}
            className="absolute"
            style={{ left, top, width, height, zIndex: isSelected ? 10 : undefined }}
            onClick={e => { e.stopPropagation(); onSelect(idx) }}
          >
            <div
              draggable={activeResize === null}
              onDragStart={e => handleWidgetDragStart(e, idx)}
              className={cn(
                'absolute inset-0 flex flex-col items-start justify-start overflow-hidden rounded',
                'select-none border',
                isSelected ? 'cursor-default' : 'cursor-move',
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
