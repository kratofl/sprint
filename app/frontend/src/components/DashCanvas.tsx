import { useRef, useState, useEffect, useCallback, useId } from 'react'
import { cn } from '@sprint/ui'
import { type DashWidget, type DashTheme, type DomainPalette, type WidgetCatalogEntry } from '@/lib/dash'
import { createDashWidgetId } from '@/lib/dash/ids'
import { WidgetPreview } from './WidgetPreview'
import {
  DEFAULT_MULTI_FUNCTION_WIDGET_COL_SPAN,
  DEFAULT_MULTI_FUNCTION_WIDGET_ROW_SPAN,
  getMultiFunctionWidgetOverlayMode,
  MULTI_FUNCTION_WIDGET_PALETTE_TYPE,
} from './dash-editor/multiFunctionWidgetState'
import {
  consumeCanvasClick,
  createCanvasInteractionState,
  suppressNextCanvasClick,
} from './canvasInteractionState'

export const DEFAULT_SCREEN_W = 800
export const DEFAULT_SCREEN_H = 480

const DEFAULT_GRID_COLS = 20
const DEFAULT_GRID_ROWS = 12

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export interface GridRect {
  id?: string
  col: number
  row: number
  colSpan: number
  rowSpan: number
  label?: string
  selected?: boolean
  locked?: boolean
  editing?: boolean
}

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

interface ActiveOverlayResize {
  overlayIdx: number
  handle: ResizeHandle
  startRect: GridRect
}

interface ActiveOverlayMove {
  overlayIdx: number
  grabOffsetCol: number
  grabOffsetRow: number
  startRect: GridRect
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
  blockedAreas: GridRect[] = [],
  placementBounds: GridRect | null = null,
): boolean {
  if (p.col < 0 || p.row < 0 || p.col + p.colSpan > cols || p.row + p.rowSpan > rows) return false
  if (placementBounds) {
    const insideBounds =
      p.col >= placementBounds.col &&
      p.row >= placementBounds.row &&
      p.col + p.colSpan <= placementBounds.col + placementBounds.colSpan &&
      p.row + p.rowSpan <= placementBounds.row + placementBounds.rowSpan
    if (!insideBounds) return false
  }
  return widgets.every((w, i) => i === excludeIdx || !overlaps(p, w)) &&
    blockedAreas.every(area => !overlaps(p, area))
}

function isValidOverlayPlacement(
  p: GridRect,
  overlays: GridRect[],
  excludeIdx: number | null,
  cols: number,
  rows: number,
  blockedAreas: GridRect[] = [],
): boolean {
  if (p.col < 0 || p.row < 0 || p.col + p.colSpan > cols || p.row + p.rowSpan > rows) return false
  return overlays.every((overlay, index) => index === excludeIdx || !overlaps(p, overlay)) &&
    blockedAreas.every(area => !overlaps(p, area))
}

export interface DashCanvasProps {
  widgets: DashWidget[]
  selectedId: number | null
  catalog?: WidgetCatalogEntry[]
  theme?: DashTheme
  domainPalette?: DomainPalette
  blockedAreas?: GridRect[]
  placementBounds?: GridRect | null
  overlayRects?: GridRect[]
  overlayBlockedAreas?: GridRect[]
  overlayEditMode?: boolean
  gridCols?: number
  gridRows?: number
  screenW?: number
  screenH?: number
  paletteDropType?: string | null
  palettePreviewUrl?: string | null
  previewUrl?: string
  onBackgroundClick?: () => void
  onSelectOverlay?: (id: string | null) => void
  onUpdateOverlay?: (id: string, rect: GridRect) => void
  onEnterOverlay?: (id: string) => void
  onDropMultiFunctionWidget?: (rect: GridRect) => void
  onSelect: (id: number | null) => void
  onUpdate: (widgets: DashWidget[]) => void
}

export function DashCanvas({
  widgets,
  gridCols = DEFAULT_GRID_COLS,
  gridRows = DEFAULT_GRID_ROWS,
  selectedId,
  catalog = [],
  theme,
  domainPalette,
  blockedAreas = [],
  placementBounds = null,
  overlayRects = [],
  overlayBlockedAreas = [],
  overlayEditMode = false,
  screenW = DEFAULT_SCREEN_W,
  screenH = DEFAULT_SCREEN_H,
  paletteDropType = null,
  palettePreviewUrl = null,
  previewUrl,
  onBackgroundClick,
  onSelectOverlay,
  onUpdateOverlay,
  onEnterOverlay,
  onDropMultiFunctionWidget,
  onSelect,
  onUpdate,
}: DashCanvasProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const canvasInteractionRef = useRef(createCanvasInteractionState())
  const widgetsRef    = useRef(widgets)
  widgetsRef.current  = widgets
  const overlaysRef   = useRef(overlayRects)
  overlaysRef.current = overlayRects
  const gridMaskId = useId()
  const minorVerticals = Array.from({ length: Math.max(0, gridCols - 1) }, (_, idx) => idx + 1)
  const minorHorizontals = Array.from({ length: Math.max(0, gridRows - 1) }, (_, idx) => idx + 1)
  const majorVerticals = minorVerticals.filter(col => col % 5 === 0)
  const majorHorizontals = minorHorizontals.filter(row => row % 3 === 0)

  const [activeResize, setActiveResize] = useState<ActiveResize | null>(null)
  const [activeMove,   setActiveMove]   = useState<ActiveMove   | null>(null)
  const [activeOverlayResize, setActiveOverlayResize] = useState<ActiveOverlayResize | null>(null)
  const [activeOverlayMove, setActiveOverlayMove] = useState<ActiveOverlayMove | null>(null)
  const [ghost,        setGhost]        = useState<Ghost        | null>(null)
  const [overlayGhost, setOverlayGhost] = useState<Ghost        | null>(null)

  const gridPos = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { col: 0, row: 0 }
    const r = containerRef.current.getBoundingClientRect()
    return {
      col: (clientX - r.left) / r.width  * gridCols,
      row: (clientY - r.top)  / r.height * gridRows,
    }
  }, [gridCols, gridRows])

  const isPointerInsideCanvas = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return false
    const rect = containerRef.current.getBoundingClientRect()
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    )
  }, [])

  const markNextCanvasClickSuppressed = useCallback(() => {
    canvasInteractionRef.current = suppressNextCanvasClick(canvasInteractionRef.current)
  }, [])

  const consumeSuppressedCanvasClick = useCallback(() => {
    const result = consumeCanvasClick(canvasInteractionRef.current)
    canvasInteractionRef.current = result.nextState
    return result.shouldSuppressClick
  }, [])

  useEffect(() => {
    if (!activeOverlayResize) return
    const { overlayIdx, handle, startRect } = activeOverlayResize
    const right = startRect.col + startRect.colSpan
    const bottom = startRect.row + startRect.rowSpan

    const onMouseMove = (e: MouseEvent) => {
      const { col: rawCol, row: rawRow } = gridPos(e.clientX, e.clientY)
      const col = Math.round(rawCol)
      const row = Math.round(rawRow)

      const rect = { ...startRect }
      if (handle.includes('e')) rect.colSpan = Math.max(1, col - rect.col)
      if (handle.includes('s')) rect.rowSpan = Math.max(1, row - rect.row)
      if (handle.includes('w')) { rect.col = Math.max(0, Math.min(col, right - 1)); rect.colSpan = right - rect.col }
      if (handle.includes('n')) { rect.row = Math.max(0, Math.min(row, bottom - 1)); rect.rowSpan = bottom - rect.row }
      rect.col = Math.max(0, rect.col)
      rect.row = Math.max(0, rect.row)
      rect.colSpan = Math.max(1, Math.min(rect.colSpan, gridCols - rect.col))
      rect.rowSpan = Math.max(1, Math.min(rect.rowSpan, gridRows - rect.row))

      const valid = isValidOverlayPlacement(rect, overlaysRef.current, overlayIdx, gridCols, gridRows, overlayBlockedAreas)
      setOverlayGhost({ col: rect.col, row: rect.row, colSpan: rect.colSpan, rowSpan: rect.rowSpan, valid })
    }

    const onMouseUp = (e: MouseEvent) => {
      const { col: rawCol, row: rawRow } = gridPos(e.clientX, e.clientY)
      const col = Math.round(rawCol)
      const row = Math.round(rawRow)
      const rect = { ...startRect }
      if (handle.includes('e')) rect.colSpan = Math.max(1, col - rect.col)
      if (handle.includes('s')) rect.rowSpan = Math.max(1, row - rect.row)
      if (handle.includes('w')) { rect.col = Math.max(0, Math.min(col, right - 1)); rect.colSpan = right - rect.col }
      if (handle.includes('n')) { rect.row = Math.max(0, Math.min(row, bottom - 1)); rect.rowSpan = bottom - rect.row }
      rect.col = Math.max(0, rect.col)
      rect.row = Math.max(0, rect.row)
      rect.colSpan = Math.max(1, Math.min(rect.colSpan, gridCols - rect.col))
      rect.rowSpan = Math.max(1, Math.min(rect.rowSpan, gridRows - rect.row))

      if (rect.id && isValidOverlayPlacement(rect, overlaysRef.current, overlayIdx, gridCols, gridRows, overlayBlockedAreas)) {
        onUpdateOverlay?.(rect.id, rect)
      }
      if (isPointerInsideCanvas(e.clientX, e.clientY)) {
        markNextCanvasClickSuppressed()
      }
      setActiveOverlayResize(null)
      setOverlayGhost(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [activeOverlayResize, gridCols, gridRows, gridPos, isPointerInsideCanvas, markNextCanvasClickSuppressed, onUpdateOverlay, overlayBlockedAreas])

  useEffect(() => {
    if (!activeOverlayMove) return
    const { overlayIdx, grabOffsetCol, grabOffsetRow, startRect } = activeOverlayMove

    const onMouseMove = (e: MouseEvent) => {
      const { col, row } = gridPos(e.clientX, e.clientY)
      const snapCol = Math.max(0, Math.min(Math.round(col - grabOffsetCol), gridCols - startRect.colSpan))
      const snapRow = Math.max(0, Math.min(Math.round(row - grabOffsetRow), gridRows - startRect.rowSpan))
      const rect = { ...startRect, col: snapCol, row: snapRow }
      const valid = isValidOverlayPlacement(rect, overlaysRef.current, overlayIdx, gridCols, gridRows, overlayBlockedAreas)
      setOverlayGhost({ col: rect.col, row: rect.row, colSpan: rect.colSpan, rowSpan: rect.rowSpan, valid })
    }

    const onMouseUp = (e: MouseEvent) => {
      const { col, row } = gridPos(e.clientX, e.clientY)
      const snapCol = Math.max(0, Math.min(Math.round(col - grabOffsetCol), gridCols - startRect.colSpan))
      const snapRow = Math.max(0, Math.min(Math.round(row - grabOffsetRow), gridRows - startRect.rowSpan))
      const rect = { ...startRect, col: snapCol, row: snapRow }
      if (rect.id && isValidOverlayPlacement(rect, overlaysRef.current, overlayIdx, gridCols, gridRows, overlayBlockedAreas)) {
        onUpdateOverlay?.(rect.id, rect)
      }
      if (isPointerInsideCanvas(e.clientX, e.clientY)) {
        markNextCanvasClickSuppressed()
      }
      setActiveOverlayMove(null)
      setOverlayGhost(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [activeOverlayMove, gridCols, gridRows, gridPos, isPointerInsideCanvas, markNextCanvasClickSuppressed, onUpdateOverlay, overlayBlockedAreas])

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

      const valid = isValidPlacement(w, widgetsRef.current, widgetIdx, gridCols, gridRows, blockedAreas, placementBounds)
      setGhost({ col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan, valid })
      onUpdate(widgetsRef.current.map((ww, i) => (i === widgetIdx ? w : ww)))
    }

    const onMouseUp = (e: MouseEvent) => {
      // If the final position overlaps another widget, revert to start
      const cur = widgetsRef.current[widgetIdx]
      if (cur && !isValidPlacement(cur, widgetsRef.current, widgetIdx, gridCols, gridRows, blockedAreas, placementBounds)) {
        onUpdate(widgetsRef.current.map((ww, i) => (i === widgetIdx ? startWidget : ww)))
      }
      if (isPointerInsideCanvas(e.clientX, e.clientY)) {
        markNextCanvasClickSuppressed()
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
  }, [activeResize, blockedAreas, gridCols, gridRows, isPointerInsideCanvas, markNextCanvasClickSuppressed, onUpdate, gridPos, placementBounds])

  // ── Move (mouse-based — no HTML5 drag ghost) ────────────────────────────────
  useEffect(() => {
    if (!activeMove) return
    const { widgetIdx, grabOffsetCol, grabOffsetRow, startWidget } = activeMove

    const onMouseMove = (e: MouseEvent) => {
      const { col, row } = gridPos(e.clientX, e.clientY)
      const snapCol  = Math.max(0, Math.min(Math.round(col - grabOffsetCol), gridCols - startWidget.colSpan))
      const snapRow  = Math.max(0, Math.min(Math.round(row - grabOffsetRow), gridRows - startWidget.rowSpan))
      const proposed = { ...startWidget, col: snapCol, row: snapRow }
      const valid    = isValidPlacement(proposed, widgetsRef.current, widgetIdx, gridCols, gridRows, blockedAreas, placementBounds)
      setGhost({ col: snapCol, row: snapRow, colSpan: startWidget.colSpan, rowSpan: startWidget.rowSpan, valid })
    }

    const onMouseUp = (e: MouseEvent) => {
      const { col, row } = gridPos(e.clientX, e.clientY)
      const snapCol  = Math.max(0, Math.min(Math.round(col - grabOffsetCol), gridCols - startWidget.colSpan))
      const snapRow  = Math.max(0, Math.min(Math.round(row - grabOffsetRow), gridRows - startWidget.rowSpan))
      const proposed = { ...startWidget, col: snapCol, row: snapRow }
      if (isValidPlacement(proposed, widgetsRef.current, widgetIdx, gridCols, gridRows, blockedAreas, placementBounds)) {
        onUpdate(widgetsRef.current.map((w, i) => (i === widgetIdx ? proposed : w)))
      }
      if (isPointerInsideCanvas(e.clientX, e.clientY)) {
        markNextCanvasClickSuppressed()
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
  }, [activeMove, blockedAreas, gridCols, gridRows, isPointerInsideCanvas, markNextCanvasClickSuppressed, onUpdate, gridPos, placementBounds])

  // ── Palette drop ──────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!paletteDropType) return
    e.dataTransfer.dropEffect = 'copy'
    const meta    = catalog.find(wt => wt.type === paletteDropType)
    const colSpan = paletteDropType === MULTI_FUNCTION_WIDGET_PALETTE_TYPE
      ? DEFAULT_MULTI_FUNCTION_WIDGET_COL_SPAN
      : (meta?.defaultColSpan ?? 4)
    const rowSpan = paletteDropType === MULTI_FUNCTION_WIDGET_PALETTE_TYPE
      ? DEFAULT_MULTI_FUNCTION_WIDGET_ROW_SPAN
      : (meta?.defaultRowSpan ?? 2)
    const { col, row } = gridPos(e.clientX, e.clientY)
    const snapCol  = Math.max(0, Math.min(Math.floor(col), gridCols - colSpan))
    const snapRow  = Math.max(0, Math.min(Math.floor(row), gridRows - rowSpan))
    const proposed = { col: snapCol, row: snapRow, colSpan, rowSpan }
    if (paletteDropType === MULTI_FUNCTION_WIDGET_PALETTE_TYPE) {
      setOverlayGhost({ ...proposed, valid: isValidOverlayPlacement(proposed, overlaysRef.current, null, gridCols, gridRows, overlayBlockedAreas) })
      setGhost(null)
      return
    }
    setGhost({ ...proposed, valid: isValidPlacement(proposed, widgetsRef.current, null, gridCols, gridRows, blockedAreas, placementBounds) })
    setOverlayGhost(null)
  }, [paletteDropType, catalog, blockedAreas, gridCols, gridRows, gridPos, overlayBlockedAreas, placementBounds])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setGhost(null)
    setOverlayGhost(null)
    const widgetType = e.dataTransfer.getData('widget-type')
    if (!widgetType) return
    const meta    = catalog.find(wt => wt.type === widgetType)
    const colSpan = widgetType === MULTI_FUNCTION_WIDGET_PALETTE_TYPE
      ? DEFAULT_MULTI_FUNCTION_WIDGET_COL_SPAN
      : (meta?.defaultColSpan ?? 4)
    const rowSpan = widgetType === MULTI_FUNCTION_WIDGET_PALETTE_TYPE
      ? DEFAULT_MULTI_FUNCTION_WIDGET_ROW_SPAN
      : (meta?.defaultRowSpan ?? 2)
    const { col, row } = gridPos(e.clientX, e.clientY)
    const snapCol  = Math.max(0, Math.min(Math.floor(col), gridCols - colSpan))
    const snapRow  = Math.max(0, Math.min(Math.floor(row), gridRows - rowSpan))
    const proposed = { col: snapCol, row: snapRow, colSpan, rowSpan }
    if (widgetType === MULTI_FUNCTION_WIDGET_PALETTE_TYPE) {
      if (isValidOverlayPlacement(proposed, overlaysRef.current, null, gridCols, gridRows, overlayBlockedAreas)) {
        onDropMultiFunctionWidget?.(proposed)
      }
      return
    }
    if (!isValidPlacement(proposed, widgetsRef.current, null, gridCols, gridRows, blockedAreas, placementBounds)) return
    const newWidget: DashWidget = {
      id: createDashWidgetId(),
      type: widgetType,
      ...proposed,
      ...(meta?.defaultPanelRules?.length ? { panelRules: meta.defaultPanelRules } : {}),
    }
    const updated = [...widgetsRef.current, newWidget]
    onUpdate(updated)
    onSelect(updated.length - 1)
  }, [catalog, blockedAreas, gridCols, gridRows, onUpdate, onSelect, gridPos, placementBounds])

  const isDragging = activeMove !== null || activeResize !== null || activeOverlayMove !== null || activeOverlayResize !== null

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden border border-border bg-black"
      style={{
        aspectRatio: `${screenW} / ${screenH}`,
        cursor: activeMove ? 'grabbing' : undefined,
      }}
      onDragOver={handleDragOver}
      onDragLeave={() => {
        setGhost(null)
        setOverlayGhost(null)
      }}
      onDrop={handleDrop}
      onClickCapture={event => {
        if (!consumeSuppressedCanvasClick()) return
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={() => {
        if (!isDragging) {
          onSelect(null)
          onBackgroundClick?.()
        }
      }}
    >

      <span className="pointer-events-none absolute bottom-1.5 right-2 z-[2] font-mono text-[10px] text-white/20">
        {screenW}×{screenH}
      </span>

      {/* Go-rendered preview — pixel-accurate match of what the screen displays */}
      {previewUrl && (
        <img
          src={previewUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ objectFit: 'contain', zIndex: 0 }}
        />
      )}

      {overlayEditMode && (
        <div
          className="pointer-events-none absolute inset-0 bg-black/45"
          style={{ zIndex: 1.5 }}
        />
      )}

      <svg
        className="pointer-events-none absolute inset-0"
        viewBox={`0 0 ${gridCols} ${gridRows}`}
        preserveAspectRatio="none"
        style={{ zIndex: 1 }}
      >
        <defs>
          <mask id={gridMaskId}>
            <rect x="0" y="0" width={gridCols} height={gridRows} fill="white" />
            {widgets.map(widget => (
              <rect
                key={widget.id}
                x={widget.col}
                y={widget.row}
                width={widget.colSpan}
                height={widget.rowSpan}
                fill="black"
              />
            ))}
          </mask>
        </defs>

        <g mask={`url(#${gridMaskId})`}>
          {minorVerticals.map(col => (
            <line
              key={`minor-v-${col}`}
              x1={col}
              y1={0}
              x2={col}
              y2={gridRows}
              stroke="rgba(255,255,255,0.08)"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {minorHorizontals.map(row => (
            <line
              key={`minor-h-${row}`}
              x1={0}
              y1={row}
              x2={gridCols}
              y2={row}
              stroke="rgba(255,255,255,0.08)"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {majorVerticals.map(col => (
            <line
              key={`major-v-${col}`}
              x1={col}
              y1={0}
              x2={col}
              y2={gridRows}
              stroke="rgba(255,255,255,0.14)"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {majorHorizontals.map(row => (
            <line
              key={`major-h-${row}`}
              x1={0}
              y1={row}
              x2={gridCols}
              y2={row}
              stroke="rgba(255,255,255,0.14)"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>

      {overlayRects.map((rect, index) => {
        const overlayMode = getMultiFunctionWidgetOverlayMode({
          selected: Boolean(rect.selected),
          editing: Boolean(rect.editing),
          locked: Boolean(rect.locked),
        })
        const canSelectByBody = Boolean(rect.id && onSelectOverlay && overlayMode.bodyInteractive)
        const canUseMoveHandle = Boolean(rect.id && onSelectOverlay && overlayMode.moveHandleInteractive)
        const canResize = Boolean(rect.id && onSelectOverlay && rect.selected && overlayMode.resizeHandlesInteractive)
        const isBeingMoved = activeOverlayMove?.overlayIdx === index
        return (
          <div
            key={rect.id ?? `${rect.label ?? 'overlay'}-${index}`}
            className="absolute"
            style={{
              left: `${(rect.col / gridCols) * 100}%`,
              top: `${(rect.row / gridRows) * 100}%`,
              width: `${(rect.colSpan / gridCols) * 100}%`,
              height: `${(rect.rowSpan / gridRows) * 100}%`,
              zIndex: overlayMode.zIndex,
              opacity: isBeingMoved ? 0.3 : 1,
              pointerEvents: canSelectByBody ? 'auto' : 'none',
            }}
            onClick={event => {
              event.stopPropagation()
              if (!isDragging && canSelectByBody && rect.id) {
                onSelectOverlay?.(rect.id)
              }
            }}
            onDoubleClick={event => {
              event.stopPropagation()
              if (canSelectByBody && rect.id) {
                onEnterOverlay?.(rect.id)
              }
            }}
          >
            <div
              className={cn(
                'absolute inset-0 border border-dashed select-none',
                canSelectByBody ? 'cursor-pointer' : 'cursor-default',
              )}
              style={{
                borderColor: rect.selected ? 'var(--accent)' : 'rgba(255,255,255,0.34)',
                background: rect.editing
                  ? 'transparent'
                  : rect.selected
                    ? 'rgba(255,144,108,0.08)'
                    : 'rgba(255,255,255,0.04)',
                boxShadow: rect.editing ? '0 0 0 1px rgba(255,144,108,0.55) inset' : undefined,
                borderWidth: rect.selected ? 2 : 1,
              }}
            />

            {rect.label && (
              <button
                type="button"
                onMouseDown={event => {
                  if (!canUseMoveHandle || event.button !== 0) return
                  event.preventDefault()
                  event.stopPropagation()
                  const { col, row } = gridPos(event.clientX, event.clientY)
                  if (rect.id) {
                    onSelectOverlay?.(rect.id)
                  }
                  setActiveOverlayMove({
                    overlayIdx: index,
                    grabOffsetCol: col - rect.col,
                    grabOffsetRow: row - rect.row,
                    startRect: { ...rect },
                  })
                }}
                onClick={event => {
                  event.stopPropagation()
                  if (rect.id) {
                    onSelectOverlay?.(rect.id)
                  }
                }}
                onDoubleClick={event => {
                  event.stopPropagation()
                  if (rect.id) {
                    onEnterOverlay?.(rect.id)
                  }
                }}
                className={cn(
                  'absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-1 font-mono text-[9px] font-bold uppercase tracking-wide shadow-sm',
                  canUseMoveHandle ? (activeOverlayMove ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default',
                )}
                style={{
                  zIndex: 18,
                  pointerEvents: canUseMoveHandle ? 'auto' : 'none',
                  background: rect.selected ? 'rgba(255,144,108,0.95)' : 'rgba(255,255,255,0.2)',
                  color: rect.selected ? '#0a0a0a' : '#f5f7fa',
                }}
              >
                <span>MFW</span>
                <span className={rect.selected ? 'opacity-80' : 'opacity-60'}>/</span>
                <span className="max-w-[10rem] truncate normal-case tracking-normal">{rect.label}</span>
              </button>
            )}

            {canResize && ALL_HANDLES.map(handle => {
              const [hLeft, hTop] = HANDLE_OFFSETS[handle]
              return (
                <div
                  key={handle}
                  onMouseDown={event => {
                    event.preventDefault()
                    event.stopPropagation()
                    setActiveOverlayResize({ overlayIdx: index, handle, startRect: { ...rect } })
                  }}
                  style={{
                    position: 'absolute',
                    left: hLeft,
                    top: hTop,
                    transform: 'translate(-50%, -50%)',
                    width: 8,
                    height: 8,
                    background: 'var(--accent)',
                    border: '1px solid black',
                    borderRadius: 1,
                    cursor: HANDLE_CURSORS[handle],
                    zIndex: 20,
                  }}
                />
              )
            })}
          </div>
        )
      })}

      {/* Drop / move / resize ghost */}
      {ghost && (
        <div
          className="pointer-events-none absolute"
          style={{
            left:       `${(ghost.col     / gridCols) * 100}%`,
            top:        `${(ghost.row     / gridRows) * 100}%`,
            width:      `${(ghost.colSpan / gridCols) * 100}%`,
            height:     `${(ghost.rowSpan / gridRows) * 100}%`,
            zIndex:     50,
            border:     `2px dashed ${ghost.valid ? 'var(--accent)' : '#F87171'}`,
            background:  ghost.valid ? 'rgba(255,144,108,0.12)' : 'rgba(248,113,113,0.12)',
            overflow:   'hidden',
          }}
        >
          {paletteDropType && palettePreviewUrl && (
            <img
              src={palettePreviewUrl}
              alt=""
              className="absolute inset-0 h-full w-full opacity-90"
              style={{ objectFit: 'fill' }}
            />
          )}
        </div>
      )}

      {overlayGhost && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: `${(overlayGhost.col / gridCols) * 100}%`,
            top: `${(overlayGhost.row / gridRows) * 100}%`,
            width: `${(overlayGhost.colSpan / gridCols) * 100}%`,
            height: `${(overlayGhost.rowSpan / gridRows) * 100}%`,
            zIndex: 15,
            border: `2px dashed ${overlayGhost.valid ? 'var(--accent)' : '#F87171'}`,
            background: overlayGhost.valid ? 'rgba(255,144,108,0.12)' : 'rgba(248,113,113,0.12)',
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
              zIndex:  isSelected ? 14 : 2,
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
                'absolute inset-0 flex flex-col items-start justify-start overflow-hidden select-none border',
                activeMove ? 'cursor-grabbing' : 'cursor-grab',
                isSelected
                  ? previewUrl ? 'bg-transparent border-accent ring-1 ring-accent/30' : 'bg-white/8 border-accent ring-1 ring-accent/30'
                  : previewUrl ? 'bg-transparent border-transparent hover:border-white/20' : 'bg-white/5 border-white/10 hover:border-white/20',
              )}
            >
              {!previewUrl && theme && (
                <WidgetPreview
                  widget={widget}
                  theme={theme}
                  domainPalette={domainPalette}
                  catalog={catalog}
                />
              )}
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
