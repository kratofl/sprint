import type { DashWidget, DashWidgetStack } from '../../lib/dash/types.ts'

export type DashEditorMode = 'page' | 'stack'


export interface DashLayerChipState {
  id: string
  name: string
  selected: boolean
  isDefault: boolean
  canMoveLeft: boolean
  canMoveRight: boolean
}

export interface DashLayerStripState {
  stackName: string
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
  selectedWidgetStack: DashWidgetStack | null
  selectedLayerId: string | null
}): DashLayerStripState | null {
  const { mode, selectedWidgetStack, selectedLayerId } = args
  if (mode !== 'stack' || !selectedWidgetStack) return null

  return {
    stackName: selectedWidgetStack.name,
    layers: selectedWidgetStack.layers.map((layer, index) => ({
      id: layer.id,
      name: layer.name,
      selected: layer.id === selectedLayerId,
      isDefault: selectedWidgetStack.defaultLayerId === layer.id,
      canMoveLeft: index > 0,
      canMoveRight: index < selectedWidgetStack.layers.length - 1,
    })),
  }
}

export function createInspectorSheetState(args: {
  mode: DashEditorMode
  selectedWidget: DashWidget | null
  selectedWidgetStack: DashWidgetStack | null
  pageName: string
}): DashInspectorSheetState {
  const { mode, selectedWidget, selectedWidgetStack, pageName } = args

  if (selectedWidget) {
    return {
      title: selectedWidget.type,
      showAdvancedGeometry: true,
    }
  }

  if (mode === 'stack' && selectedWidgetStack) {
    return {
      title: `STACK · ${selectedWidgetStack.name}`,
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
