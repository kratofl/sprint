import type { DashPage, DashWidget, DashWidgetStack, DashWidgetStackLayer } from '../../lib/dash/types.ts'
import { createDashLayerId, createDashWidgetStackId } from '../../lib/dash/ids.ts'

export const DEFAULT_WIDGET_STACK_COL_SPAN = 6
export const DEFAULT_WIDGET_STACK_ROW_SPAN = 4
export const WIDGET_STACK_PALETTE_TYPE = '__multi_function_widget__'

export type PageEditContext = { kind: 'page' }
export type WidgetStackEditContext = {
  kind: 'widget-stack'
  groupId: string
  layerId: string
}
export type DashEditContext = PageEditContext | WidgetStackEditContext

export interface WidgetStackSelectionState {
  selectedWidgetStackId: string | null
  selectedLayerId: string | null
  editContext: DashEditContext
}

export type PaletteDropTarget =
  | { scope: 'page' }
  | { scope: 'layer'; groupId: string; layerId: string }

interface WidgetStackOverlayModeInput {
  selected: boolean
  editing: boolean
  locked: boolean
}

interface WidgetStackOverlayMode {
  bodyInteractive: boolean
  moveHandleInteractive: boolean
  resizeHandlesInteractive: boolean
  zIndex: number
}

interface GridRect {
  col: number
  row: number
  colSpan: number
  rowSpan: number
}

interface CreateWidgetStackArgs {
  page: DashPage
  drop: { col: number; row: number }
  gridCols: number
  gridRows: number
  createID?: (kind: 'stack' | 'layer') => string
}

function overlaps(a: GridRect, b: GridRect): boolean {
  return (
    a.col < b.col + b.colSpan &&
    a.col + a.colSpan > b.col &&
    a.row < b.row + b.rowSpan &&
    a.row + a.rowSpan > b.row
  )
}

function nextGeneratedName(page: DashPage): string {
  const nextIndex = (page.widgetStacks?.length ?? 0) + 1
  return `Widget Stack ${nextIndex}`
}

export function createPageEditContext(): PageEditContext {
  return { kind: 'page' }
}

export function exitToPageEditMode(): PageEditContext {
  return createPageEditContext()
}

export function createClearedWidgetStackSelectionState(): WidgetStackSelectionState {
  return {
    selectedWidgetStackId: null,
    selectedLayerId: null,
    editContext: createPageEditContext(),
  }
}

export function createWidgetStackSelectionState(
  page: DashPage,
  groupId: string,
  layerSelections: Record<string, string> = {},
): WidgetStackSelectionState | null {
  const group = (page.widgetStacks ?? []).find(candidate => candidate.id === groupId)
  if (!group) return null

  const selectionKey = `${page.id}:${group.id}`
  const layerId =
    layerSelections[selectionKey] ??
    group.defaultLayerId ??
    group.layers[0]?.id ??
    null

  return {
    selectedWidgetStackId: group.id,
    selectedLayerId: layerId,
    editContext: createPageEditContext(),
  }
}

export function createWidgetStackEditState(
  page: DashPage,
  groupId: string,
  layerSelections: Record<string, string> = {},
): WidgetStackSelectionState | null {
  const editContext = enterWidgetStackMode(page, groupId, layerSelections)
  if (!editContext) return null

  return {
    selectedWidgetStackId: editContext.groupId,
    selectedLayerId: editContext.layerId,
    editContext,
  }
}

export function enterWidgetStackMode(
  page: DashPage,
  groupId: string,
  layerSelections: Record<string, string> = {},
): WidgetStackEditContext | null {
  const group = (page.widgetStacks ?? []).find(candidate => candidate.id === groupId)
  if (!group) return null

  const selectionKey = `${page.id}:${group.id}`
  const layerId =
    layerSelections[selectionKey] ??
    group.defaultLayerId ??
    group.layers[0]?.id

  if (!layerId) return null

  return {
    kind: 'widget-stack',
    groupId: group.id,
    layerId,
  }
}

export function getPaletteDropTarget(context: DashEditContext): PaletteDropTarget {
  if (context.kind === 'widget-stack') {
    return {
      scope: 'layer',
      groupId: context.groupId,
      layerId: context.layerId,
    }
  }
  return { scope: 'page' }
}

export function getWidgetStackOverlayMode({
  selected,
  editing,
  locked,
}: WidgetStackOverlayModeInput): WidgetStackOverlayMode {
  if (locked) {
    return {
      bodyInteractive: false,
      moveHandleInteractive: false,
      resizeHandlesInteractive: false,
      zIndex: 4,
    }
  }

  if (selected && editing) {
    return {
      bodyInteractive: false,
      moveHandleInteractive: true,
      resizeHandlesInteractive: true,
      zIndex: 6,
    }
  }

  return {
    bodyInteractive: true,
    moveHandleInteractive: selected,
    resizeHandlesInteractive: selected,
    zIndex: selected ? 12 : 4,
  }
}

export function clampWidgetToLayerBounds(widget: DashWidget, group: DashWidgetStack): DashWidget {
  const colSpan = Math.max(1, Math.min(widget.colSpan, group.colSpan))
  const rowSpan = Math.max(1, Math.min(widget.rowSpan, group.rowSpan))
  return {
    ...widget,
    col: Math.max(0, Math.min(widget.col, group.colSpan - colSpan)),
    row: Math.max(0, Math.min(widget.row, group.rowSpan - rowSpan)),
    colSpan,
    rowSpan,
  }
}

export function isValidWidgetStackPlacement(
  candidate: GridRect,
  page: DashPage,
  gridCols: number,
  gridRows: number,
  excludeGroupId?: string,
): boolean {
  if (candidate.col < 0 || candidate.row < 0) return false
  if (candidate.col + candidate.colSpan > gridCols) return false
  if (candidate.row + candidate.rowSpan > gridRows) return false

  if (page.widgets.some(widget => overlaps(candidate, widget))) {
    return false
  }

  return !(page.widgetStacks ?? []).some(group =>
    group.id !== excludeGroupId &&
    overlaps(candidate, group),
  )
}

export function createWidgetStackOnDrop({
  page,
  drop,
  gridCols,
  gridRows,
  createID = kind => kind === 'stack' ? createDashWidgetStackId() : createDashLayerId(),
}: CreateWidgetStackArgs): { page: DashPage; context: WidgetStackEditContext } {
  const groupID = createID('stack')
  const layerID = createID('layer')
  const colSpan = Math.min(DEFAULT_WIDGET_STACK_COL_SPAN, gridCols)
  const rowSpan = Math.min(DEFAULT_WIDGET_STACK_ROW_SPAN, gridRows)
  const nextGroup: DashWidgetStack = {
    id: groupID,
    name: nextGeneratedName(page),
    col: Math.max(0, Math.min(Math.floor(drop.col), gridCols - colSpan)),
    row: Math.max(0, Math.min(Math.floor(drop.row), gridRows - rowSpan)),
    colSpan,
    rowSpan,
    defaultLayerId: layerID,
    layers: [{ id: layerID, name: 'Layer 1', widgets: [] }],
  }

  const nextPage: DashPage = {
    ...page,
    widgetStacks: [...(page.widgetStacks ?? []), nextGroup],
  }

  return {
    page: nextPage,
    context: {
      kind: 'widget-stack',
      groupId: groupID,
      layerId: layerID,
    },
  }
}

// ── Pure widget-stack / layer reducers ──────────────────────────────────────────
//
// The dash editor controller used to hand-write the same immutable update shell
// `(page.widgetStacks ?? []).map(g => g.id === id ? {...} : g)` (and a matching
// per-layer map) in ~10 handlers. These reducers are the single source of those
// shapes so the controller handlers only orchestrate selection/persistence side
// effects. They are pure (no IDs/DOM) — callers pass any generated ids/layers in.

/** Replace the matching widget stack on a page via `transform`; others untouched. */
export function mapWidgetStack(
  page: DashPage,
  stackId: string,
  transform: (stack: DashWidgetStack) => DashWidgetStack,
): DashPage {
  return {
    ...page,
    widgetStacks: (page.widgetStacks ?? []).map(group => group.id === stackId ? transform(group) : group),
  }
}

/** Replace the matching layer in a stack via `transform`; others untouched. */
export function mapLayer(
  stack: DashWidgetStack,
  layerId: string,
  transform: (layer: DashWidgetStackLayer) => DashWidgetStackLayer,
): DashWidgetStack {
  return {
    ...stack,
    layers: stack.layers.map(layer => layer.id === layerId ? transform(layer) : layer),
  }
}

/** Replace all widgets on one layer (callers clamp/filter the array beforehand). */
export function setLayerWidgets(stack: DashWidgetStack, layerId: string, widgets: DashWidget[]): DashWidgetStack {
  return mapLayer(stack, layerId, layer => ({ ...layer, widgets }))
}

/** Append a pre-built layer; it becomes the default when the stack has none. */
export function appendLayer(stack: DashWidgetStack, layer: DashWidgetStackLayer): DashWidgetStack {
  return {
    ...stack,
    layers: [...stack.layers, layer],
    defaultLayerId: stack.defaultLayerId ?? layer.id,
  }
}

/** Insert a pre-built layer directly after `sourceLayerId` (assumed present). */
export function insertLayerAfter(
  stack: DashWidgetStack,
  sourceLayerId: string,
  layer: DashWidgetStackLayer,
): DashWidgetStack {
  const sourceIndex = stack.layers.findIndex(candidate => candidate.id === sourceLayerId)
  const layers = [...stack.layers]
  layers.splice(sourceIndex + 1, 0, layer)
  return { ...stack, layers }
}

/** Rename one layer. */
export function renameLayer(stack: DashWidgetStack, layerId: string, name: string): DashWidgetStack {
  return mapLayer(stack, layerId, layer => ({ ...layer, name }))
}

/** Remove a layer, repointing `defaultLayerId` to the first survivor if needed. */
export function removeLayer(stack: DashWidgetStack, layerId: string): DashWidgetStack {
  const layers = stack.layers.filter(layer => layer.id !== layerId)
  return {
    ...stack,
    layers,
    defaultLayerId: stack.defaultLayerId === layerId ? layers[0]?.id : stack.defaultLayerId,
  }
}

/** Move a layer one slot in `direction`; no-op when the move is out of range. */
export function moveLayer(stack: DashWidgetStack, layerId: string, direction: -1 | 1): DashWidgetStack {
  const currentIndex = stack.layers.findIndex(layer => layer.id === layerId)
  const nextIndex = currentIndex + direction
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= stack.layers.length) return stack
  const layers = [...stack.layers]
  const [moved] = layers.splice(currentIndex, 1)
  layers.splice(nextIndex, 0, moved)
  return { ...stack, layers }
}

/** Set the stack's default layer. */
export function setDefaultLayer(stack: DashWidgetStack, layerId: string): DashWidgetStack {
  return { ...stack, defaultLayerId: layerId }
}
