import type { DashPage, DashWidget, DashWrapperGroup } from '../../lib/dash/types.ts'
import { createDashLayerId, createDashMfwId } from '../../lib/dash/ids.ts'

export const DEFAULT_MULTI_FUNCTION_WIDGET_COL_SPAN = 6
export const DEFAULT_MULTI_FUNCTION_WIDGET_ROW_SPAN = 4
export const MULTI_FUNCTION_WIDGET_PALETTE_TYPE = '__multi_function_widget__'

export type PageEditContext = { kind: 'page' }
export type MultiFunctionWidgetEditContext = {
  kind: 'multi-function-widget'
  groupId: string
  layerId: string
}
export type DashEditContext = PageEditContext | MultiFunctionWidgetEditContext

export interface WrapperGroupSelectionState {
  selectedWrapperGroupId: string | null
  selectedVariantId: string | null
  editContext: DashEditContext
}

export type PaletteDropTarget =
  | { scope: 'page' }
  | { scope: 'layer'; groupId: string; layerId: string }

interface MultiFunctionWidgetOverlayModeInput {
  selected: boolean
  editing: boolean
  locked: boolean
}

interface MultiFunctionWidgetOverlayMode {
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

interface CreateMultiFunctionWidgetArgs {
  page: DashPage
  drop: { col: number; row: number }
  gridCols: number
  gridRows: number
  createID?: (kind: 'mfw' | 'layer') => string
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
  const nextIndex = (page.wrapperGroups?.length ?? 0) + 1
  return `Multi-Function Widget ${nextIndex}`
}

export function createPageEditContext(): PageEditContext {
  return { kind: 'page' }
}

export function exitToPageEditMode(): PageEditContext {
  return createPageEditContext()
}

export function createClearedWrapperGroupSelectionState(): WrapperGroupSelectionState {
  return {
    selectedWrapperGroupId: null,
    selectedVariantId: null,
    editContext: createPageEditContext(),
  }
}

export function createWrapperGroupSelectionState(
  page: DashPage,
  groupId: string,
  layerSelections: Record<string, string> = {},
): WrapperGroupSelectionState | null {
  const group = (page.wrapperGroups ?? []).find(candidate => candidate.id === groupId)
  if (!group) return null

  const selectionKey = `${page.id}:${group.id}`
  const layerId =
    layerSelections[selectionKey] ??
    group.defaultVariantId ??
    group.variants[0]?.id ??
    null

  return {
    selectedWrapperGroupId: group.id,
    selectedVariantId: layerId,
    editContext: createPageEditContext(),
  }
}

export function createWrapperGroupEditState(
  page: DashPage,
  groupId: string,
  layerSelections: Record<string, string> = {},
): WrapperGroupSelectionState | null {
  const editContext = enterMultiFunctionWidgetMode(page, groupId, layerSelections)
  if (!editContext) return null

  return {
    selectedWrapperGroupId: editContext.groupId,
    selectedVariantId: editContext.layerId,
    editContext,
  }
}

export function enterMultiFunctionWidgetMode(
  page: DashPage,
  groupId: string,
  layerSelections: Record<string, string> = {},
): MultiFunctionWidgetEditContext | null {
  const group = (page.wrapperGroups ?? []).find(candidate => candidate.id === groupId)
  if (!group) return null

  const selectionKey = `${page.id}:${group.id}`
  const layerId =
    layerSelections[selectionKey] ??
    group.defaultVariantId ??
    group.variants[0]?.id

  if (!layerId) return null

  return {
    kind: 'multi-function-widget',
    groupId: group.id,
    layerId,
  }
}

export function getPaletteDropTarget(context: DashEditContext): PaletteDropTarget {
  if (context.kind === 'multi-function-widget') {
    return {
      scope: 'layer',
      groupId: context.groupId,
      layerId: context.layerId,
    }
  }
  return { scope: 'page' }
}

export function getMultiFunctionWidgetOverlayMode({
  selected,
  editing,
  locked,
}: MultiFunctionWidgetOverlayModeInput): MultiFunctionWidgetOverlayMode {
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

export function clampWidgetToLayerBounds(widget: DashWidget, group: DashWrapperGroup): DashWidget {
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

export function isValidMultiFunctionWidgetPlacement(
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

  return !(page.wrapperGroups ?? []).some(group =>
    group.id !== excludeGroupId &&
    overlaps(candidate, group),
  )
}

export function createMultiFunctionWidgetOnDrop({
  page,
  drop,
  gridCols,
  gridRows,
  createID = kind => kind === 'mfw' ? createDashMfwId() : createDashLayerId(),
}: CreateMultiFunctionWidgetArgs): { page: DashPage; context: MultiFunctionWidgetEditContext } {
  const groupID = createID('mfw')
  const layerID = createID('layer')
  const colSpan = Math.min(DEFAULT_MULTI_FUNCTION_WIDGET_COL_SPAN, gridCols)
  const rowSpan = Math.min(DEFAULT_MULTI_FUNCTION_WIDGET_ROW_SPAN, gridRows)
  const nextGroup: DashWrapperGroup = {
    id: groupID,
    name: nextGeneratedName(page),
    col: Math.max(0, Math.min(Math.floor(drop.col), gridCols - colSpan)),
    row: Math.max(0, Math.min(Math.floor(drop.row), gridRows - rowSpan)),
    colSpan,
    rowSpan,
    defaultVariantId: layerID,
    variants: [{ id: layerID, name: 'Layer 1', widgets: [] }],
  }

  const nextPage: DashPage = {
    ...page,
    wrapperGroups: [...(page.wrapperGroups ?? []), nextGroup],
  }

  return {
    page: nextPage,
    context: {
      kind: 'multi-function-widget',
      groupId: groupID,
      layerId: layerID,
    },
  }
}
