import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { EyeOff, Group, Plus } from 'lucide-react'
import { DashCanvas, cellAt, drawnWidgets, gridLines, hasLabel, layoutRect, pageTree } from '@sprint/dashboard'
import type { DashGroupNode, DashLayout, DashNode, DashPage, DashWidget, DashWidgetType, GridSpan, LayoutGrid, PixelRect } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import {
  canPlaceNewWidget,
  growToSmallest,
  newWidgetRect,
  previewMoveRect,
  previewResizeRect,
  rectsIntersect,
  setWidgetLabel,
  swapWidgets,
  widgetFormAt,
  widgetName,
  type GridRect,
  type ResizeHandle,
} from '../views/DashesDomain'
import { boundsOf, clickTarget, findNode, hiddenWidgets, nodeRect, parentGroup, selectionWidgets, setNodeRect, translateNodes } from './groupOps'
import { DashLabels, DashOutline, type CanvasView } from './CanvasViews'
import { GridGrips, type LineDrag } from './GridGrips'
import { LabelBar } from './LabelBar'
import { moveGridLine } from './layoutOps'
import { nodeName } from './NodeLabel'
import type { MenuAnchor } from '../shell/Menu'
import type { Mutate } from './useDesignerDoc'

export type PointerPos = { x: number; y: number }

/**
 * Direct-manipulation state for the canvas: idle, a library item being dragged onto the grid, the
 * selection being moved as one, or one selected item (a widget or a group) being resized from one
 * of its 8 edge/corner handles. One `DragState` drives the ghost preview, the validity colour and
 * the commit on release. A single widget released over another widget swaps places with it, or
 * stacks onto it with Alt held (`alt`). A drag is committed once, on release, so it is one undo step.
 */
export type DragState =
  | { kind: 'idle' }
  | { kind: 'placing'; widgetType: DashWidgetType; pointer: PointerPos | null }
  | { kind: 'moving'; ids: readonly string[]; start: GridRect; pointerStart: PointerPos; pointer: PointerPos; alt: boolean }
  | { kind: 'resizing'; id: string; handle: ResizeHandle; start: GridRect; pointerStart: PointerPos; pointer: PointerPos }

/**
 * What the tag on a widget being resized says: the form it lands in and what that form leaves
 * out ("Compact · brake temperature hidden"); for a widget with one form, only that it stopped at
 * its smallest size (`stopped`). Null when there is nothing to say.
 */
function formTag(layout: DashLayout, type: string, rect: GridRect, stopped: boolean): string | null {
  const { form, several } = widgetFormAt(layout, type, rect)
  if (several) return [form.name, form.hides && `${form.hides} hidden`].filter(Boolean).join(' · ')
  return stopped ? 'Smallest size' : null
}

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

/** The cell under `pointer` on a `width` x `height` canvas of `grid`, where a dropped widget goes from. */
export function dropCell(grid: LayoutGrid, pointer: PointerPos, width: number, height: number): { col: number; row: number } {
  return cellAt(grid, width, height, pointer.x, pointer.y)
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
 * The dash as `view` shows it — its outline, or the live dash faded back or tagged
 * (`CanvasViews.tsx`) — with an interactive overlay placed with the same `gridRect` math the
 * renderer places widgets with, so it never drifts from what is drawn. A widget hidden
 * on the wheel keeps a crossed-out eye where it sits. A click on a widget selects its outermost group (a
 * double-click the widget itself; Ctrl/Cmd/Shift-click adds to the selection); a drag moves the
 * selection as one, and a single selected item resizes from its handles — a group scales its
 * widgets. Over a stack being worked on, tabs pick the layer to arrange (designer only; the wheel
 * shows its first layer). `shownPage` is the page as drawn here, with those layers showing.
 * `backdrop` draws instead of the dash (the pit limiter's stage), and nothing shows or goes in the
 * `covered` spans (the spots its yellow covers). With `resizeTracks`, grips on the bezel resize the
 * dash's columns and rows (`GridGrips`).
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
  view,
  selection,
  onSelect,
  stacks,
  arranged,
  onPickLayer,
  onAddLayer,
  onGroup,
  onStackOnto,
  onSwap,
  onMenu,
  placeGroup,
  dragState,
  setDragState,
  commit,
  backdrop,
  covered = [],
  resizeTracks = false,
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
  view: CanvasView
  selection: readonly string[]
  onSelect: (ids: string[]) => void
  /** The stacks to show layer tabs on. */
  stacks: readonly DashGroupNode[]
  /** The layer each stack shows here. */
  arranged: ReadonlyMap<string, string>
  onPickLayer: (stackId: string, layerId: string) => void
  onAddLayer: (stackId: string) => void
  onGroup: () => void
  /** A single widget dropped onto another: stack the two in the target's cell. */
  onStackOnto: (id: string, targetId: string) => void
  /** A single widget dropped onto another: the two swap places. */
  onSwap: (id: string, targetId: string) => void
  /** Right-click on a widget (the node a click would select) or on empty canvas (null). */
  onMenu: (id: string | null, anchor: MenuAnchor) => void
  /** The group a dropped library widget goes into. */
  placeGroup: string | null
  dragState: DragState
  setDragState: (state: DragState) => void
  commit: (mutate: Mutate, failureMessage: string) => void
  /** Draws in place of the dash, at the canvas size, under the labels (not in the outline view). */
  backdrop?: (width: number, height: number) => ReactNode
  /** Spans nothing is shown, hit-tested or dropped in. */
  covered?: readonly GridSpan[]
  /** Whether grips on the bezel resize the dash's columns and rows (a dash with its own track sizes). */
  resizeTracks?: boolean
}) {
  // A grid line being dragged moves on the canvas at once; the layout changes on release.
  const [lineDrag, setLineDrag] = useState<LineDrag | null>(null)
  const drawn = (lineDrag && moveGridLine(layout, lineDrag.axis, lineDrag.line, lineDrag.at)) || layout
  // Same fallback as the renderer's own cols/rows resolution: the overlay's grid must match what is drawn.
  const cols = layout.gridCols > 0 ? layout.gridCols : 20
  const rows = layout.gridRows > 0 ? layout.gridRows : 12
  const pixels = (rect: GridRect): PixelRect => layoutRect(drawn, width, height, rect)
  const cellOf = (pointer: PointerPos): { col: number; row: number } => cellAt(drawn, width, height, pointer.x, pointer.y)
  // What the canvas shows and hit-tests: never a widget in a covered span.
  const inSight = (widget: DashWidget): boolean => !covered.some((span) => rectsIntersect(span, widget))
  const shownWidgets = drawnWidgets(shownPage).filter(inSight)
  const shownLayout: DashLayout = layout.idlePage?.id === page.id ? { ...drawn, idlePage: shownPage } : { ...drawn, pages: drawn.pages.map((item) => (item.id === page.id ? shownPage : item)) }
  const lines = gridLines(drawn, width, height)

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
    startDrag({ kind: 'moving', ids, start, pointerStart: pointer, pointer, alt: event.altKey }, event)
  }

  const onHandleDown = (node: DashNode, start: GridRect, handle: ResizeHandle, event: ReactPointerEvent<HTMLElement>): void => {
    event.stopPropagation()
    if (!canvasRef.current || event.button !== 0) return
    const pointer = relativePointerPos(event, canvasRef.current)
    startDrag({ kind: 'resizing', id: node.id, handle, start, pointerStart: pointer, pointer }, event)
  }

  const continueDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!canvasRef.current) return
    if (dragState.kind === 'moving') setDragState({ ...dragState, pointer: relativePointerPos(event, canvasRef.current), alt: event.altKey })
    else if (dragState.kind === 'resizing') setDragState({ ...dragState, pointer: relativePointerPos(event, canvasRef.current) })
  }

  /** The widget being resized, or null for anything else (a group resizes freely). */
  const resizedWidget = (state: DragState): DashWidget | null => {
    if (state.kind !== 'resizing') return null
    const node = findNode(tree, state.id)
    return node?.kind === 'widget' ? node.widget : null
  }

  /** Where the pointer puts the dragged item; a resized widget is held at its smallest form. */
  const dragRect = (state: Extract<DragState, { kind: 'moving' | 'resizing' }>): GridRect => {
    const from = cellOf(state.pointerStart)
    const to = cellOf(state.pointer)
    const deltaCol = to.col - from.col
    const deltaRow = to.row - from.row
    if (state.kind === 'moving') return previewMoveRect(state.start, deltaCol, deltaRow, cols, rows)
    const rect = previewResizeRect(state.start, state.handle, deltaCol, deltaRow, cols, rows)
    const widget = resizedWidget(state)
    return widget ? growToSmallest(layout, widget.type, rect, state.handle) : rect
  }

  /** The single widget being dragged, or null for anything else (a group, several, a resize). */
  const movingWidget = (state: DragState): DashWidget | null => {
    if (state.kind !== 'moving' || state.ids.length !== 1) return null
    const moving = findNode(tree, state.ids[0] ?? '')
    return moving?.kind === 'widget' ? moving.widget : null
  }

  /**
   * The widget a single dragged widget is over, to swap with (or stack onto, with Alt): the drawn
   * widget under the pointer that is not the one moving. Null for anything else being dragged.
   */
  const dropTarget = (state: DragState): DashWidget | null => {
    const moving = movingWidget(state)
    if (!moving || state.kind !== 'moving') return null
    const { col, row } = cellOf(state.pointer)
    return shownWidgets.find((item) => item.id !== moving.id && col >= item.col && col < item.col + item.colSpan && row >= item.row && row < item.row + item.rowSpan) ?? null
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
    const onto = dropTarget(dragState)
    if (onto && dragState.kind === 'moving') {
      if (dragState.alt) onStackOnto(dragState.ids[0] ?? '', onto.id)
      else onSwap(dragState.ids[0] ?? '', onto.id)
    } else if (dragState.kind === 'moving' || dragState.kind === 'resizing') {
      const edit = dragEdit(dragState)
      if (edit) commit(edit, dragState.kind === 'moving' ? "Can't move there — it would overlap another widget." : "Can't resize there — widgets would overlap.")
    }
    if (dragState.kind !== 'idle') setDragState({ kind: 'idle' })
  }

  let ghost: { rect: GridRect; valid: boolean; label?: 'Stack here' | 'Swap'; tag?: string | null; was?: GridRect } | null = null
  const moving = movingWidget(dragState)
  const onto = dropTarget(dragState)
  if (onto && moving && dragState.kind === 'moving') {
    ghost = dragState.alt ? { rect: onto, valid: true, label: 'Stack here' } : { rect: onto, valid: swapWidgets(layout, page.id, moving.id, onto.id) !== null, label: 'Swap' }
  } else if (dragState.kind === 'moving' || dragState.kind === 'resizing') {
    const edit = dragEdit(dragState)
    const rect = dragRect(dragState)
    ghost = { rect, valid: edit === null || edit(layout) !== null }
    const resized = resizedWidget(dragState)
    if (resized && dragState.kind === 'resizing') {
      const from = cellOf(dragState.pointerStart)
      const to = cellOf(dragState.pointer)
      const raw = previewResizeRect(dragState.start, dragState.handle, to.col - from.col, to.row - from.row, cols, rows)
      const stopped = raw.colSpan !== rect.colSpan || raw.rowSpan !== rect.rowSpan
      ghost = { ...ghost, tag: formTag(layout, resized.type, rect, stopped), was: dragState.start }
    }
  } else if (dragState.kind === 'placing' && dragState.pointer) {
    const cell = cellOf(dragState.pointer)
    const rect = newWidgetRect(layout, dragState.widgetType, cell.col, cell.row)
    ghost = { rect, valid: !covered.some((span) => rectsIntersect(span, rect)) && canPlaceNewWidget(layout, page.id, dragState.widgetType, rect, placeGroup) }
  }
  const dragging = dragState.kind === 'moving' || dragState.kind === 'resizing'

  // The widgets a dragged one could swap with (none for a new one from the library).
  const swapTargets = moving ? shownWidgets.filter((item) => item.id !== moving.id && swapWidgets(layout, page.id, moving.id, item.id) !== null) : []

  return (
    <div
      ref={canvasRef}
      className={`designer-canvas is-${view}`}
      aria-label="Dash canvas. Click selects a group, double-click a widget in it; Delete removes the selection; arrow keys move it; Ctrl+G groups; Escape deselects."
      style={{ width, height }}
      onPointerMove={continueDrag}
      onPointerUp={endDrag}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelect([])
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu(null, { x: event.clientX, y: event.clientY })
      }}
    >
      {view === 'outline' ? (
        <DashOutline layout={drawn} page={shownPage} width={width} height={height} />
      ) : (
        <>
          {backdrop ? backdrop(width, height) : <DashCanvas layout={shownLayout} frame={frame} width={width} height={height} pageId={page.id} idle={isIdlePage} />}
          <DashLabels view={view} layout={drawn} page={shownPage} width={width} height={height} />
        </>
      )}
      {showGrid && view !== 'outline' && (
        <div className="designer-grid-overlay" aria-hidden="true">
          {lines.cols.slice(1, -1).map((x) => (
            <span key={`c${x}`} className="is-col" style={{ left: x }} />
          ))}
          {lines.rows.slice(1, -1).map((y) => (
            <span key={`r${y}`} className="is-row" style={{ top: y }} />
          ))}
        </div>
      )}
      {resizeTracks && layout.colSizes && layout.rowSizes && <GridGrips layout={drawn} width={width} height={height} drag={lineDrag} onDrag={setLineDrag} commit={commit} />}
      {swapTargets.map((item) => (
        <div key={item.id} className="designer-swap-target" style={box(pixels(item))} />
      ))}

      {shownWidgets.map((widget) => (
        <div
          key={widget.id}
          className="designer-widget-overlay"
          style={box(pixels(widget))}
          onPointerDown={(event) => onWidgetDown(widget.id, event)}
          onDoubleClick={() => onSelect([widget.id])}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onMenu(clickTarget(tree, widget.id, selection), { x: event.clientX, y: event.clientY })
          }}
        />
      ))}

      {hiddenWidgets(pageTree(shownPage)).filter(inSight).map((widget) => (
        <div
          key={widget.id}
          className="designer-hidden-widget"
          style={box(pixels(widget))}
          title={`${widgetName(widget)} · hidden on the wheel`}
          onPointerDown={(event) => onWidgetDown(widget.id, event)}
          onDoubleClick={() => onSelect([widget.id])}
          onContextMenu={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onMenu(clickTarget(tree, widget.id, selection), { x: event.clientX, y: event.clientY })
          }}
        >
          <EyeOff size={14} aria-hidden="true" />
        </div>
      ))}

      {!dragging &&
        selectedNodes.map((node) => {
          const rect = nodeRect(node)
          if (!rect) return null
          // A stack and its layers wear the stack's blue; a layer's name is already on its tab.
          const layer = parentGroup(tree, node.id)?.group.mode === 'oneAtATime'
          const stack = layer || (node.kind === 'group' && node.group.mode === 'oneAtATime')
          const hidden = node.kind === 'group' ? node.group.hidden === true : node.widget.hidden === true
          // A widget with a label gets the label bar above it, in place of its name.
          const labelBar = single !== undefined && node.kind === 'widget' && hasLabel(node.widget.type)
          return (
            <div key={node.id} className={`designer-selection${stack ? ' is-stack' : ''}${hidden ? ' is-hidden' : ''}`} style={box(pixels(rect))}>
              {single && !stack && !labelBar && <span className="designer-widget-tag">{nodeName(node)}</span>}
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

      {!dragging && single?.kind === 'widget' && hasLabel(single.widget.type) && (
        <LabelBar
          layout={layout}
          widget={single.widget}
          left={pixels(single.widget).left}
          top={pixels(single.widget).top}
          onPick={(label) => commit((current) => setWidgetLabel(current, page.id, single.widget.id, label), "The label couldn't be moved.")}
        />
      )}

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

      {ghost?.was && <div className="designer-resize-was" style={box(pixels(ghost.was))} aria-hidden="true" />}
      {ghost && (
        <div className={`designer-ghost${ghost.label === 'Stack here' ? ' is-stack' : ghost.label === 'Swap' && ghost.valid ? ' is-swap' : ''}${ghost.valid ? '' : ' is-invalid'}`} style={box(pixels(ghost.rect))}>
          {ghost.label && ghost.valid && <span className="designer-ghost-label">{ghost.label}</span>}
          {ghost.tag && <span className="designer-form-tag">{ghost.tag}</span>}
        </div>
      )}
    </div>
  )
}
