import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { Group, Plus } from 'lucide-react'
import { DashRenderer, drawnWidgets, gridRect } from '@sprint/dashboard'
import type { DashGroupNode, DashLayout, DashNode, DashPage, DashWidgetType, PixelRect } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { DEFAULT_WIDGET_COL_SPAN, DEFAULT_WIDGET_ROW_SPAN, canPlaceNewWidget, previewMoveRect, previewResizeRect, type GridRect, type ResizeHandle } from '../views/DashesDomain'
import { boundsOf, clickTarget, findNode, nodeRect, parentGroup, selectionWidgets, setNodeRect, translateNodes } from './groupOps'
import { nodeName } from './WidgetSidebar'
import type { Mutate } from './useDesignerDoc'

export type PointerPos = { x: number; y: number }

/**
 * Direct-manipulation state for the canvas: idle, a library item being dragged onto the grid, the
 * selection being moved as one, or one selected item (a widget or a group) being resized from one
 * of its 8 edge/corner handles. One `DragState` drives the ghost preview, the validity colour and
 * the commit on release. A drag is committed once, on release, so it is one undo step.
 */
export type DragState =
  | { kind: 'idle' }
  | { kind: 'placing'; widgetType: DashWidgetType; pointer: PointerPos | null }
  | { kind: 'moving'; ids: readonly string[]; start: GridRect; pointerStart: PointerPos; pointer: PointerPos }
  | { kind: 'resizing'; id: string; handle: ResizeHandle; start: GridRect; pointerStart: PointerPos; pointer: PointerPos }

const RESIZE_HANDLES: readonly ResizeHandle[] = [
  { hx: -1, hy: -1 }, { hx: 0, hy: -1 }, { hx: 1, hy: -1 },
  { hx: -1, hy: 0 }, { hx: 1, hy: 0 },
  { hx: -1, hy: 1 }, { hx: 0, hy: 1 }, { hx: 1, hy: 1 },
]

/** A pointer's position relative to an element, in its own pixels. */
export function relativePointerPos(event: ReactPointerEvent, element: HTMLElement): PointerPos {
  const rect = element.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

/** The cell a new widget dropped at `pointer` starts in, clamped so the default size fits. */
export function dropCell(pointer: PointerPos, cellW: number, cellH: number, cols: number, rows: number): { col: number; row: number } {
  return {
    col: Math.max(0, Math.min(Math.floor(pointer.x / cellW), Math.max(0, cols - DEFAULT_WIDGET_COL_SPAN))),
    row: Math.max(0, Math.min(Math.floor(pointer.y / cellH), Math.max(0, rows - DEFAULT_WIDGET_ROW_SPAN))),
  }
}

function handleCursor(handle: ResizeHandle): string {
  if (handle.hx === 0) return 'ns-resize'
  if (handle.hy === 0) return 'ew-resize'
  return handle.hx === handle.hy ? 'nwse-resize' : 'nesw-resize'
}

/** Position for one of a selected item's 8 edge/corner resize handles, centred on that edge/corner. */
function handleStyle(handle: ResizeHandle): CSSProperties {
  const style: CSSProperties = { cursor: handleCursor(handle) }
  if (handle.hx < 0) style.left = -5
  else if (handle.hx > 0) style.right = -5
  else {
    style.left = '50%'
    style.marginLeft = -5
  }
  if (handle.hy < 0) style.top = -5
  else if (handle.hy > 0) style.bottom = -5
  else {
    style.top = '50%'
    style.marginTop = -5
  }
  return style
}

const box = (rect: PixelRect): CSSProperties => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })

/**
 * The live dash with an interactive overlay, placed with the same `gridRect` math `DashRenderer`
 * uses so it never drifts from what is drawn. A click on a widget selects its outermost group (a
 * double-click the widget itself; Ctrl/Cmd/Shift-click adds to the selection); a drag moves the
 * selection as one, and a single selected item resizes from its handles — a group scales its
 * widgets. Over a stack being worked on, tabs pick the layer to arrange (designer only; the wheel
 * shows its first layer). `shownPage` is the page as drawn here, with those layers showing.
 */
export function DesignerCanvas({
  canvasRef,
  layout,
  page,
  shownPage,
  tree,
  isIdlePage,
  frame,
  width,
  height,
  showGrid,
  selection,
  onSelect,
  stacks,
  arranged,
  onPickLayer,
  onAddLayer,
  onGroup,
  placeGroup,
  dragState,
  setDragState,
  commit,
}: {
  canvasRef: RefObject<HTMLDivElement | null>
  layout: DashLayout
  page: DashPage
  shownPage: DashPage
  tree: DashNode[]
  isIdlePage: boolean
  frame: TelemetryFrame | null
  width: number
  height: number
  showGrid: boolean
  selection: readonly string[]
  onSelect: (ids: string[]) => void
  /** The stacks to show layer tabs on. */
  stacks: readonly DashGroupNode[]
  /** The layer each stack shows here. */
  arranged: ReadonlyMap<string, string>
  onPickLayer: (stackId: string, layerId: string) => void
  onAddLayer: (stackId: string) => void
  onGroup: () => void
  /** The group a dropped library widget goes into. */
  placeGroup: string | null
  dragState: DragState
  setDragState: (state: DragState) => void
  commit: (mutate: Mutate, failureMessage: string) => void
}) {
  // Same fallback as `DashRenderer`'s own cols/rows resolution: the overlay's grid must match what is drawn.
  const cols = layout.gridCols > 0 ? layout.gridCols : 20
  const rows = layout.gridRows > 0 ? layout.gridRows : 12
  const cellW = width / cols
  const cellH = height / rows
  const pixels = (rect: GridRect): PixelRect => gridRect(width, height, cols, rows, rect)
  const shownLayout: DashLayout = layout.idlePage?.id === page.id ? { ...layout, idlePage: shownPage } : { ...layout, pages: layout.pages.map((item) => (item.id === page.id ? shownPage : item)) }

  const selectedNodes = selection.map((id) => findNode(tree, id)).filter((node): node is DashNode => node !== null)
  const single = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const selectionBounds = boundsOf(selectionWidgets(tree, selection))

  const startDrag = (state: DragState, event: ReactPointerEvent<HTMLElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragState(state)
  }

  const onWidgetDown = (widgetId: string, event: ReactPointerEvent<HTMLElement>): void => {
    if (!canvasRef.current || event.button !== 0) return
    const target = clickTarget(tree, widgetId, selection)
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      onSelect(selection.includes(target) ? selection.filter((id) => id !== target) : [...selection, target])
      return
    }
    const ids = selection.includes(target) ? [...selection] : [target]
    if (!selection.includes(target)) onSelect(ids)
    const start = boundsOf(selectionWidgets(tree, ids))
    if (!start) return
    const pointer = relativePointerPos(event, canvasRef.current)
    startDrag({ kind: 'moving', ids, start, pointerStart: pointer, pointer }, event)
  }

  const onHandleDown = (node: DashNode, start: GridRect, handle: ResizeHandle, event: ReactPointerEvent<HTMLElement>): void => {
    event.stopPropagation()
    if (!canvasRef.current || event.button !== 0) return
    const pointer = relativePointerPos(event, canvasRef.current)
    startDrag({ kind: 'resizing', id: node.id, handle, start, pointerStart: pointer, pointer }, event)
  }

  const continueDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!canvasRef.current || (dragState.kind !== 'moving' && dragState.kind !== 'resizing')) return
    setDragState({ ...dragState, pointer: relativePointerPos(event, canvasRef.current) })
  }

  const dragRect = (state: Extract<DragState, { kind: 'moving' | 'resizing' }>): GridRect => {
    const deltaCol = Math.round((state.pointer.x - state.pointerStart.x) / cellW)
    const deltaRow = Math.round((state.pointer.y - state.pointerStart.y) / cellH)
    return state.kind === 'moving' ? previewMoveRect(state.start, deltaCol, deltaRow, cols, rows) : previewResizeRect(state.start, state.handle, deltaCol, deltaRow, cols, rows)
  }

  /** The edit a drag would make, or null when it changes nothing. */
  const dragEdit = (state: Extract<DragState, { kind: 'moving' | 'resizing' }>): Mutate | null => {
    const rect = dragRect(state)
    const { start } = state
    if (rect.col === start.col && rect.row === start.row && rect.colSpan === start.colSpan && rect.rowSpan === start.rowSpan) return null
    return state.kind === 'moving'
      ? (current) => translateNodes(current, page.id, state.ids, rect.col - start.col, rect.row - start.row)
      : (current) => setNodeRect(current, page.id, state.id, rect)
  }

  const endDrag = (): void => {
    if (dragState.kind === 'moving' || dragState.kind === 'resizing') {
      const edit = dragEdit(dragState)
      if (edit) commit(edit, dragState.kind === 'moving' ? "Can't move there — it would overlap another widget." : "Can't resize there — widgets would overlap.")
    }
    if (dragState.kind !== 'idle') setDragState({ kind: 'idle' })
  }

  let ghost: { rect: GridRect; valid: boolean } | null = null
  if (dragState.kind === 'moving' || dragState.kind === 'resizing') {
    const edit = dragEdit(dragState)
    ghost = { rect: dragRect(dragState), valid: edit === null || edit(layout) !== null }
  } else if (dragState.kind === 'placing' && dragState.pointer) {
    const rect: GridRect = { ...dropCell(dragState.pointer, cellW, cellH, cols, rows), colSpan: Math.min(DEFAULT_WIDGET_COL_SPAN, cols), rowSpan: Math.min(DEFAULT_WIDGET_ROW_SPAN, rows) }
    ghost = { rect, valid: canPlaceNewWidget(layout, page.id, rect, placeGroup) }
  }
  const dragging = dragState.kind === 'moving' || dragState.kind === 'resizing'

  return (
    <div
      ref={canvasRef}
      className="designer-canvas"
      aria-label="Dash canvas. Click selects a group, double-click a widget in it; Delete removes the selection; arrow keys move it; Ctrl+G groups; Escape deselects."
      style={{ width, height }}
      onPointerMove={continueDrag}
      onPointerUp={endDrag}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelect([])
      }}
    >
      <DashRenderer layout={shownLayout} frame={frame} width={width} height={height} pageId={page.id} idle={isIdlePage} />
      {showGrid && <div className="designer-grid-overlay" style={{ backgroundSize: `${cellW}px ${cellH}px` }} />}

      {drawnWidgets(shownPage).map((widget) => (
        <div
          key={widget.id}
          className="designer-widget-overlay"
          style={box(pixels(widget))}
          onPointerDown={(event) => onWidgetDown(widget.id, event)}
          onDoubleClick={() => onSelect([widget.id])}
        />
      ))}

      {!dragging &&
        selectedNodes.map((node) => {
          const rect = nodeRect(node)
          if (!rect) return null
          // A stack and its layers wear the stack's blue; a layer's name is already on its tab.
          const layer = parentGroup(tree, node.id)?.group.mode === 'oneAtATime'
          const stack = layer || (node.kind === 'group' && node.group.mode === 'oneAtATime')
          const hidden = node.kind === 'group' ? node.group.hidden === true : node.widget.hidden === true
          return (
            <div key={node.id} className={`designer-selection${stack ? ' is-stack' : ''}${hidden ? ' is-hidden' : ''}`} style={box(pixels(rect))}>
              {single && !stack && <span className="designer-widget-tag">{nodeName(node)}</span>}
              {single &&
                RESIZE_HANDLES.map((handle) => (
                  <span key={`${handle.hx}:${handle.hy}`} className="designer-resize-handle" style={handleStyle(handle)} onPointerDown={(event) => onHandleDown(node, rect, handle, event)} />
                ))}
            </div>
          )
        })}

      {!dragging &&
        stacks.map((stack) => {
          const rect = nodeRect(stack)
          if (!rect) return null
          const pixel = pixels(rect)
          return (
            <div key={stack.id} className="designer-layer-tabs" role="tablist" aria-label={`Layers of ${stack.group.name}`} style={{ left: pixel.left + pixel.width, top: pixel.top }}>
              {stack.children.map((child) => (
                <button key={child.id} type="button" role="tab" className="designer-layer-tab" aria-selected={arranged.get(stack.id) === child.id} onClick={() => onPickLayer(stack.id, child.id)}>
                  {nodeName(child)}
                </button>
              ))}
              <button type="button" className="designer-layer-tab is-add" aria-label={`Add a layer to ${stack.group.name}`} title="Add layer" onClick={() => onAddLayer(stack.id)}>
                <Plus size={12} />
              </button>
            </div>
          )
        })}

      {!dragging && selectedNodes.length > 1 && selectionBounds && (
        <div className="designer-glass designer-selection-bar" style={{ left: pixels(selectionBounds).left, top: pixels(selectionBounds).top }}>
          <span className="muted">{selectedNodes.every((node) => node.kind === 'widget') ? `${selectedNodes.length} widgets` : `${selectedNodes.length} items`}</span>
          <span className="designer-dock-sep" aria-hidden="true" />
          <button type="button" className="button small primary" onClick={onGroup}>
            <Group /> Group
          </button>
          <span className="muted designer-selection-key">Ctrl+G</span>
        </div>
      )}

      {ghost && <div className={ghost.valid ? 'designer-ghost' : 'designer-ghost is-invalid'} style={box(pixels(ghost.rect))} />}
    </div>
  )
}
