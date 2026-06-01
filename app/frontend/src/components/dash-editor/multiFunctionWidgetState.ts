import type { DashPage, DashWidget, DashWidgetStack } from '../../lib/dash/types.ts'
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
