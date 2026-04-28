import type { DashWidget, DashWrapperGroup } from '../../lib/dash/types.ts'

export type DashEditorMode = 'page' | 'mfw'


export interface DashLayerChipState {
  id: string
  name: string
  selected: boolean
  isDefault: boolean
  canMoveLeft: boolean
  canMoveRight: boolean
}

export interface DashLayerStripState {
  groupName: string
  layers: DashLayerChipState[]
}

export interface DashInspectorSheetState {
  title: string
  showAdvancedGeometry: boolean
}

export interface DashToolPanelPresentationState {
  surface: 'popover' | 'dialog'
  panelWidth: number
  maxHeightVh: number
}

export type InspectorPanelEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'selection-change' }
  | { type: 'mode-change' }
  | { type: 'page-change' }


export function createLayerStripState(args: {
  mode: DashEditorMode
  selectedWrapperGroup: DashWrapperGroup | null
  selectedVariantId: string | null
}): DashLayerStripState | null {
  const { mode, selectedWrapperGroup, selectedVariantId } = args
  if (mode !== 'mfw' || !selectedWrapperGroup) return null

  return {
    groupName: selectedWrapperGroup.name,
    layers: selectedWrapperGroup.variants.map((variant, index) => ({
      id: variant.id,
      name: variant.name,
      selected: variant.id === selectedVariantId,
      isDefault: selectedWrapperGroup.defaultVariantId === variant.id,
      canMoveLeft: index > 0,
      canMoveRight: index < selectedWrapperGroup.variants.length - 1,
    })),
  }
}

export function createInspectorSheetState(args: {
  mode: DashEditorMode
  selectedWidget: DashWidget | null
  selectedWrapperGroup: DashWrapperGroup | null
  pageName: string
}): DashInspectorSheetState {
  const { mode, selectedWidget, selectedWrapperGroup, pageName } = args

  if (selectedWidget) {
    return {
      title: `WIDGET · ${selectedWidget.type}`,
      showAdvancedGeometry: true,
    }
  }

  if (mode === 'mfw' && selectedWrapperGroup) {
    return {
      title: `MFW · ${selectedWrapperGroup.name}`,
      showAdvancedGeometry: true,
    }
  }

  return {
    title: `PAGE · ${pageName}`,
    showAdvancedGeometry: false,
  }
}

export function reduceInspectorPanelOpenState(
  open: boolean,
  event: InspectorPanelEvent,
): boolean {
  switch (event.type) {
    case 'open':
      return true
    case 'close':
      return false
    case 'selection-change':
    case 'mode-change':
    case 'page-change':
      return open
  }
}

export function createToolPanelPresentationState(viewportWidth: number): DashToolPanelPresentationState {
  if (viewportWidth < 960) {
    return {
      surface: 'dialog',
      panelWidth: 336,
      maxHeightVh: 70,
    }
  }

  return {
    surface: 'popover',
    panelWidth: 352,
    maxHeightVh: 75,
  }
}
