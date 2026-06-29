import { useRef, useState, useEffect, useCallback, useId } from 'react'
import { cn } from '@sprint/ui'
import { type DashWidget, type DashTheme, type DomainPalette, type WidgetCatalogEntry } from '@/lib/dash'
import { createDashWidgetId } from '@/lib/dash/ids'
import { WidgetPreview } from './WidgetPreview'
import {
  DEFAULT_WIDGET_STACK_COL_SPAN,
  DEFAULT_WIDGET_STACK_ROW_SPAN,
  getWidgetStackOverlayMode,
  WIDGET_STACK_PALETTE_TYPE,
} from './dash-editor/multiFunctionWidgetState'
import {
  consumeCanvasClick,
  createCanvasInteractionState,
  suppressNextCanvasClick,
} from './canvasInteractionState'
import {
  resolveMoveGeom,
  resolveResizeGeom,
  type ResizeHandle,
} from './dash-editor/canvasDragMath'

export const DEFAULT_SCREEN_W = 800
export const DEFAULT_SCREEN_H = 480

const DEFAULT_GRID_COLS = 20
const DEFAULT_GRID_ROWS = 12
export interface GridRect {
  id?: string
  col: number
  row: number
  colSpan: number
  rowSpan: number
  label?: string
  meta?: string
  detail?: string
  secondaryDetail?: string
  actionLabel?: string
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

const EMPTY_INVALID_IDS: ReadonlySet<string> = new Set()

// Whether a rectangle sits inside the grid (and inside any placement bounds).
// This is the *commit* gate: overlaps are allowed to be held temporarily while
// editing (the save control gates on layout validity instead), but a widget may
// never leave its grid rectangle or, for stack children, its stack bounds.
function isWithinBounds(
  p: { col: number; row: number; colSpan: number; rowSpan: number },
  cols: number,
  rows: number,
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
  return true
}

// Whether a placement is fully valid (in bounds AND non-overlapping). Used only
// to colour the drag ghost — an overlapping ghost shows red as a warning, but the
// move/resize still commits so the editor can hold the temporary overlap.
function isValidPlacement(
  p: { col: number; row: number; colSpan: number; rowSpan: number },
  widgets: DashWidget[],
  excludeIdx: number | null,
  cols: number,
  rows: number,
  blockedAreas: GridRect[] = [],
  placementBounds: GridRect | null = null,
): boolean {
  if (!isWithinBounds(p, cols, rows, placementBounds)) return false
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
  /** Widget / widget-stack ids that layout validation has flagged as invalid (overlapping or out of bounds). */
  invalidIds?: ReadonlySet<string>
  overlayRects?: GridRect[]
  overlayBlockedAreas?: GridRect[]
  overlayEditMode?: boolean
  showGrid?: boolean
  gridCols?: number
  gridRows?: number
  screenW?: number
  screenH?: number
  readOnly?: boolean
  fillParent?: boolean
  paletteDropType?: string | null
  palettePreviewUrl?: string | null
  previewUrl?: string
  previewCrop?: {
    left: number
    top: number
    width: number
    height: number
  } | null
  onBackgroundClick?: () => void
  onSelectOverlay?: (id: string | null) => void
  onUpdateOverlay?: (id: string, rect: GridRect) => void
  onEnterOverlay?: (id: string) => void
  onDropWidgetStack?: (rect: GridRect) => void
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
  invalidIds = EMPTY_INVALID_IDS,
  overlayRects = [],
  overlayBlockedAreas = [],
  overlayEditMode = false,
  showGrid = true,
  screenW = DEFAULT_SCREEN_W,
  screenH = DEFAULT_SCREEN_H,
  readOnly = false,
  fillParent = false,
  paletteDropType = null,
  palettePreviewUrl = null,
  previewUrl,
  previewCrop = null,
  onBackgroundClick,
  onSelectOverlay,
  onUpdateOverlay,
  onEnterOverlay,
  onDropWidgetStack,
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

    const resolveRect = (e: MouseEvent) => {
      const { col, row } = gridPos(e.clientX, e.clientY)
      return { ...startRect, ...resolveResizeGeom(startRect, handle, col, row, gridCols, gridRows) }
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = resolveRect(e)
      const valid = isValidOverlayPlacement(rect, overlaysRef.current, overlayIdx, gridCols, gridRows, overlayBlockedAreas)
      setOverlayGhost({ col: rect.col, row: rect.row, colSpan: rect.colSpan, rowSpan: rect.rowSpan, valid })
    }

    const onMouseUp = (e: MouseEvent) => {
      const rect = resolveRect(e)
      // Overlaps are held as temporary invalid state; only the grid bounds gate the commit.
      if (rect.id && isWithinBounds(rect, gridCols, gridRows)) {
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

    const resolveRect = (e: MouseEvent) => {
      const { col, row } = gridPos(e.clientX, e.clientY)
      return { ...startRect, ...resolveMoveGeom(startRect, grabOffsetCol, grabOffsetRow, col, row, gridCols, gridRows) }
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = resolveRect(e)
      const valid = isValidOverlayPlacement(rect, overlaysRef.current, overlayIdx, gridCols, gridRows, overlayBlockedAreas)
      setOverlayGhost({ col: rect.col, row: rect.row, colSpan: rect.colSpan, rowSpan: rect.rowSpan, valid })
    }

    const onMouseUp = (e: MouseEvent) => {
      const rect = resolveRect(e)
      // Overlaps are held as temporary invalid state; only the grid bounds gate the commit.
      if (rect.id && isWithinBounds(rect, gridCols, gridRows)) {
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

    const onMouseMove = (e: MouseEvent) => {
      const { col, row } = gridPos(e.clientX, e.clientY)
      const w = { ...startWidget, ...resolveResizeGeom(startWidget, handle, col, row, gridCols, gridRows) }
      const valid = isValidPlacement(w, widgetsRef.current, widgetIdx, gridCols, gridRows, blockedAreas, placementBounds)
      setGhost({ col: w.col, row: w.row, colSpan: w.colSpan, rowSpan: w.rowSpan, valid })
      onUpdate(widgetsRef.current.map((ww, i) => (i === widgetIdx ? w : ww)))
    }

    const onMouseUp = (e: MouseEvent) => {
      // Overlaps are held as temporary invalid state (save is gated on validity);
      // only revert when the final position would leave the grid / stack bounds.
      const cur = widgetsRef.current[widgetIdx]
      if (cur && !isWithinBounds(cur, gridCols, gridRows, placementBounds)) {
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

    const resolveWidget = (e: MouseEvent) => {
      const { col, row } = gridPos(e.clientX, e.clientY)
      return { ...startWidget, ...resolveMoveGeom(startWidget, grabOffsetCol, grabOffsetRow, col, row, gridCols, gridRows) }
    }

    const onMouseMove = (e: MouseEvent) => {
      const proposed = resolveWidget(e)
      const valid    = isValidPlacement(proposed, widgetsRef.current, widgetIdx, gridCols, gridRows, blockedAreas, placementBounds)
      setGhost({ col: proposed.col, row: proposed.row, colSpan: proposed.colSpan, rowSpan: proposed.rowSpan, valid })
    }

    const onMouseUp = (e: MouseEvent) => {
      const proposed = resolveWidget(e)
      // Commit even when overlapping (held as temporary invalid state); the bounds
      // check keeps the widget inside the grid / its stack region.
      if (isWithinBounds(proposed, gridCols, gridRows, placementBounds)) {
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
    if (readOnly) return
    e.preventDefault()
    if (!paletteDropType) return
    e.dataTransfer.dropEffect = 'copy'
    const meta    = catalog.find(wt => wt.type === paletteDropType)
    const colSpan = paletteDropType === WIDGET_STACK_PALETTE_TYPE
      ? DEFAULT_WIDGET_STACK_COL_SPAN
      : (meta?.defaultColSpan ?? 4)
    const rowSpan = paletteDropType === WIDGET_STACK_PALETTE_TYPE
      ? DEFAULT_WIDGET_STACK_ROW_SPAN
      : (meta?.defaultRowSpan ?? 2)
    const { col, row } = gridPos(e.clientX, e.clientY)
    const snapCol  = Math.max(0, Math.min(Math.floor(col), gridCols - colSpan))
    const snapRow  = Math.max(0, Math.min(Math.floor(row), gridRows - rowSpan))
    const proposed = { col: snapCol, row: snapRow, colSpan, rowSpan }
    if (paletteDropType === WIDGET_STACK_PALETTE_TYPE) {
      setOverlayGhost({ ...proposed, valid: isValidOverlayPlacement(proposed, overlaysRef.current, null, gridCols, gridRows, overlayBlockedAreas) })
      setGhost(null)
      return
    }
    setGhost({ ...proposed, valid: isValidPlacement(proposed, widgetsRef.current, null, gridCols, gridRows, blockedAreas, placementBounds) })
    setOverlayGhost(null)
  }, [readOnly, paletteDropType, catalog, blockedAreas, gridCols, gridRows, gridPos, overlayBlockedAreas, placementBounds])

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (readOnly) return
    e.preventDefault()
    setGhost(null)
    setOverlayGhost(null)
    const widgetType = e.dataTransfer.getData('widget-type')
    if (!widgetType) return
    const meta    = catalog.find(wt => wt.type === widgetType)
    const colSpan = widgetType === WIDGET_STACK_PALETTE_TYPE
      ? DEFAULT_WIDGET_STACK_COL_SPAN
      : (meta?.defaultColSpan ?? 4)
    const rowSpan = widgetType === WIDGET_STACK_PALETTE_TYPE
      ? DEFAULT_WIDGET_STACK_ROW_SPAN
      : (meta?.defaultRowSpan ?? 2)
    const { col, row } = gridPos(e.clientX, e.clientY)
    const snapCol  = Math.max(0, Math.min(Math.floor(col), gridCols - colSpan))
    const snapRow  = Math.max(0, Math.min(Math.floor(row), gridRows - rowSpan))
    const proposed = { col: snapCol, row: snapRow, colSpan, rowSpan }
    if (widgetType === WIDGET_STACK_PALETTE_TYPE) {
      if (isValidOverlayPlacement(proposed, overlaysRef.current, null, gridCols, gridRows, overlayBlockedAreas)) {
        onDropWidgetStack?.(proposed)
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
  }, [readOnly, catalog, blockedAreas, gridCols, gridRows, onUpdate, onSelect, gridPos, placementBounds])

  const isDragging = activeMove !== null || activeResize !== null || activeOverlayMove !== null || activeOverlayResize !== null
  const hasPreviewCrop = previewCrop
    && previewCrop.width > 0
    && previewCrop.height > 0
    && previewCrop.width <= 1
    && previewCrop.height <= 1
  const previewImageStyle = hasPreviewCrop
    ? {
      left: `${-(previewCrop.left / previewCrop.width) * 100}%`,
      top: `${-(previewCrop.top / previewCrop.height) * 100}%`,
      width: `${(1 / previewCrop.width) * 100}%`,
      height: `${(1 / previewCrop.height) * 100}%`,
      objectFit: 'fill' as const,
      zIndex: 0,
      maxWidth: 'none',
    }
    : {
      left: 0,
      top: 0,
      width: '100%',
      height: '100%',
      objectFit: 'contain' as const,
      zIndex: 0,
    }

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full overflow-hidden border border-border bg-black', fillParent && 'h-full')}
      style={{
        aspectRatio: fillParent ? undefined : `${screenW} / ${screenH}`,
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
        if (!isDragging && !readOnly) {
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
          className="pointer-events-none absolute"
          style={previewImageStyle}
        />
      )}

      {overlayEditMode && (
        <div
          className="pointer-events-none absolute inset-0 bg-black/45"
          style={{ zIndex: 1.5 }}
        />
      )}

      {showGrid && (
        <svg
          data-testid="placement-grid"
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

          {/* Subtle dotted placement field at interior grid intersections (PRD #27).
              The snapping grid (cols/rows) is unchanged — only the visual changed
              from boxing lines to dots; major intersections are slightly emphasised. */}
          <g mask={`url(#${gridMaskId})`}>
            {minorVerticals.map(col =>
              minorHorizontals.map(row => {
                const major = col % 5 === 0 && row % 3 === 0
                return (
                  <circle
                    key={`dot-${col}-${row}`}
                    cx={col}
                    cy={row}
                    r={major ? 0.07 : 0.045}
                    fill={major ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.11)'}
                  />
                )
              }),
            )}
          </g>
        </svg>
      )}

      {overlayRects.map((rect, index) => {
        const overlayMode = getWidgetStackOverlayMode({
          selected: Boolean(rect.selected),
          editing: Boolean(rect.editing),
          locked: Boolean(rect.locked),
        })
        const canSelectByBody = !readOnly && Boolean(rect.id && onSelectOverlay && overlayMode.bodyInteractive)
        const canUseMoveHandle = !readOnly && Boolean(rect.id && onSelectOverlay && overlayMode.moveHandleInteractive)
        const canResize = !readOnly && Boolean(rect.id && onSelectOverlay && rect.selected && overlayMode.resizeHandlesInteractive)
        const isBeingMoved = activeOverlayMove?.overlayIdx === index
        const isInvalid = Boolean(rect.id && invalidIds.has(rect.id))
        return (
          <div
            key={rect.id ?? `${rect.label ?? 'overlay'}-${index}`}
            data-invalid={isInvalid || undefined}
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
                borderColor: isInvalid ? 'var(--red)' : rect.selected ? 'var(--orange)' : 'rgba(255,255,255,0.34)',
                background: isInvalid
                  ? 'color-mix(in srgb, var(--red) 16%, transparent)'
                  : rect.editing
                    ? 'transparent'
                    : rect.selected
                      ? 'color-mix(in srgb, var(--orange) 10%, transparent)'
                      : 'rgba(255,255,255,0.04)',
                boxShadow: isInvalid ? '0 0 0 2px var(--red) inset' : rect.editing ? '0 0 0 1px var(--orange) inset' : undefined,
                borderWidth: isInvalid || rect.selected ? 2 : 1,
              }}
            />

            {rect.label && (
              <>
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
                    'absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-badge px-2 py-1 font-saira-sc text-[10px] font-bold uppercase tracking-wide',
                    canUseMoveHandle ? (activeOverlayMove ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default',
                  )}
                  style={{
                    zIndex: 18,
                    pointerEvents: canUseMoveHandle ? 'auto' : 'none',
                    background: rect.selected ? 'var(--orange)' : 'var(--panel-3)',
                    color: rect.selected ? 'var(--bg)' : 'var(--text)',
                  }}
                >
                  <span>STACK</span>
                  <span className={rect.selected ? 'opacity-80' : 'opacity-60'}>/</span>
                  <span className="max-w-[10rem] truncate normal-case tracking-normal">{rect.label}</span>
                </button>

                {rect.selected && !rect.editing && (rect.meta || rect.detail || rect.actionLabel) && (
                  <div
                    className="absolute inset-x-2 bottom-2 rounded-[8px] border border-[var(--border)] bg-[var(--panel)] px-[10px] py-2 text-left"
                    style={{ zIndex: 18, pointerEvents: 'auto' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="truncate font-mono text-[10px] text-foreground">{rect.label}</div>
                        {rect.meta && (
                          <div className="font-mono text-[9px] uppercase tracking-wide text-text-disabled">{rect.meta}</div>
                        )}
                        {rect.detail && (
                          <div className="truncate font-mono text-[10px] text-text-muted">{rect.detail}</div>
                        )}
                        {rect.secondaryDetail && (
                          <div className="truncate font-mono text-[10px] text-foreground">Current {rect.secondaryDetail}</div>
                        )}
                      </div>
                      {rect.actionLabel && rect.id && onEnterOverlay && (
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation()
                            onEnterOverlay(rect.id!)
                          }}
                          className="flex-shrink-0 rounded-badge border border-[var(--orange-ring)] bg-[var(--orange-tint)] px-2 py-1 font-saira-sc text-[10px] font-bold uppercase tracking-wide text-[var(--orange)] transition-colors hover:bg-[color-mix(in_srgb,var(--orange)_18%,transparent)]"
                        >
                          {rect.actionLabel}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
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
                    background: 'var(--orange)',
                    border: '1px solid var(--bg-deep)',
                    borderRadius: 2,
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
            border:     `2px dashed ${ghost.valid ? 'var(--orange)' : 'var(--red)'}`,
            background:  ghost.valid ? 'color-mix(in srgb, var(--orange) 12%, transparent)' : 'color-mix(in srgb, var(--red) 12%, transparent)',
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
            border: `2px dashed ${overlayGhost.valid ? 'var(--orange)' : 'var(--red)'}`,
            background: overlayGhost.valid ? 'color-mix(in srgb, var(--orange) 12%, transparent)' : 'color-mix(in srgb, var(--red) 12%, transparent)',
          }}
        />
      )}

      {widgets.map((widget, idx) => {
        const isSelected   = selectedId === idx
        const isBeingMoved = activeMove?.widgetIdx === idx
        const isInvalid    = Boolean(widget.id && invalidIds.has(widget.id))

        return (
          <div
            key={idx}
            data-invalid={isInvalid || undefined}
            className="absolute"
            style={{
              left:    `${(widget.col     / gridCols) * 100}%`,
              top:     `${(widget.row     / gridRows) * 100}%`,
              width:   `${(widget.colSpan / gridCols) * 100}%`,
              height:  `${(widget.rowSpan / gridRows) * 100}%`,
              zIndex:  isInvalid ? 16 : isSelected ? 14 : 2,
              opacity: isBeingMoved ? 0.2 : 1,
            }}
            onClick={e => { e.stopPropagation(); if (!isDragging && !readOnly) onSelect(idx) }}
          >
            <div
              onMouseDown={e => {
                if (readOnly || e.button !== 0 || activeResize) return
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
                readOnly ? 'cursor-default' : activeMove ? 'cursor-grabbing' : 'cursor-grab',
                // Collision treatment is the most prominent state — it overrides selected/hover styling.
                isInvalid
                  ? 'border-[var(--red)] bg-[color-mix(in_srgb,var(--red)_14%,transparent)] outline outline-2 outline-[var(--red)]'
                  : isSelected
                    ? previewUrl ? 'border-[var(--orange)] bg-transparent outline outline-2 outline-[var(--orange)]' : 'border-[var(--orange)] bg-[color-mix(in_srgb,var(--orange)_8%,transparent)] outline outline-2 outline-[var(--orange)]'
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

            {isSelected && !readOnly && (
              <span className="pointer-events-none absolute left-1.5 top-1.5 z-20 rounded-badge bg-[var(--orange)] px-2 py-0.5 font-saira-sc text-[10px] font-bold uppercase tracking-wide text-[var(--bg)]">
                Selected
              </span>
            )}

            {isSelected && !readOnly && ALL_HANDLES.map(handle => {
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
                    background:   'var(--orange)',
                    border:       '1px solid var(--bg-deep)',
                    borderRadius: 2,
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
