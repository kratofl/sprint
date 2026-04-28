import test from 'node:test'
import assert from 'node:assert/strict'

import type { DashPage, DashWidget, DashWrapperGroup } from '../../lib/dash/types.ts'
import {
  clampWidgetToLayerBounds,
  createClearedWrapperGroupSelectionState,
  createMultiFunctionWidgetOnDrop,
  createPageEditContext,
  createWrapperGroupEditState,
  createWrapperGroupSelectionState,
  enterMultiFunctionWidgetMode,
  exitToPageEditMode,
  getMultiFunctionWidgetOverlayMode,
  getPaletteDropTarget,
  isValidMultiFunctionWidgetPlacement,
} from './multiFunctionWidgetState.ts'

function createPage(overrides: Partial<DashPage> = {}): DashPage {
  return {
    id: 'page-main',
    name: 'Main',
    widgets: [],
    wrapperGroups: [],
    ...overrides,
  }
}

function createGroup(overrides: Partial<DashWrapperGroup> = {}): DashWrapperGroup {
  return {
    id: 'group-a',
    name: 'Stack',
    col: 2,
    row: 1,
    colSpan: 6,
    rowSpan: 4,
    defaultVariantId: 'layer-a',
    variants: [{ id: 'layer-a', name: 'Layer 1', widgets: [] }],
    ...overrides,
  }
}

test('createMultiFunctionWidgetOnDrop adds a default-sized multi-function widget and enters layer mode', () => {
  const page = createPage()
  let nextID = 0

  const result = createMultiFunctionWidgetOnDrop({
    page,
    drop: { col: 18, row: 10 },
    gridCols: 20,
    gridRows: 12,
    createID: () => {
      nextID += 1
      return `generated-id-${nextID}`
    },
  })

  assert.equal(result.page.wrapperGroups?.length, 1)
  assert.deepEqual(result.page.wrapperGroups?.[0], {
    id: 'generated-id-1',
    name: 'Multi-Function Widget 1',
    col: 14,
    row: 8,
    colSpan: 6,
    rowSpan: 4,
    defaultVariantId: 'generated-id-2',
    variants: [{ id: 'generated-id-2', name: 'Layer 1', widgets: [] }],
  })
  assert.deepEqual(result.context, {
    kind: 'multi-function-widget',
    groupId: 'generated-id-1',
    layerId: 'generated-id-2',
  })
})

test('enterMultiFunctionWidgetMode resolves the active layer and exitToPageEditMode leaves it', () => {
  const page = createPage({ wrapperGroups: [createGroup()] })

  const context = enterMultiFunctionWidgetMode(page, 'group-a', { 'page-main:group-a': 'layer-a' })

  assert.deepEqual(context, {
    kind: 'multi-function-widget',
    groupId: 'group-a',
    layerId: 'layer-a',
  })
  assert.deepEqual(exitToPageEditMode(), createPageEditContext())
})

test('createWrapperGroupSelectionState keeps page mode active while selecting a multi-function widget', () => {
  const page = createPage({ wrapperGroups: [createGroup()] })

  assert.deepEqual(
    createWrapperGroupSelectionState(page, 'group-a', { 'page-main:group-a': 'layer-a' }),
    {
      selectedWrapperGroupId: 'group-a',
      selectedVariantId: 'layer-a',
      editContext: createPageEditContext(),
    },
  )
})

test('createWrapperGroupEditState enters multi-function widget edit mode explicitly', () => {
  const page = createPage({ wrapperGroups: [createGroup()] })

  assert.deepEqual(
    createWrapperGroupEditState(page, 'group-a', { 'page-main:group-a': 'layer-a' }),
    {
      selectedWrapperGroupId: 'group-a',
      selectedVariantId: 'layer-a',
      editContext: {
        kind: 'multi-function-widget',
        groupId: 'group-a',
        layerId: 'layer-a',
      },
    },
  )
})

test('createClearedWrapperGroupSelectionState drops the current selection and exits edit mode', () => {
  assert.deepEqual(createClearedWrapperGroupSelectionState(), {
    selectedWrapperGroupId: null,
    selectedVariantId: null,
    editContext: createPageEditContext(),
  })
})

test('getPaletteDropTarget routes drops to the page or the active layer based on edit context', () => {
  assert.deepEqual(getPaletteDropTarget(createPageEditContext()), { scope: 'page' })
  assert.deepEqual(
    getPaletteDropTarget({ kind: 'multi-function-widget', groupId: 'group-a', layerId: 'layer-a' }),
    { scope: 'layer', groupId: 'group-a', layerId: 'layer-a' },
  )
})

test('getMultiFunctionWidgetOverlayMode stops the MFW body from capturing input during layer edit mode', () => {
  assert.deepEqual(
    getMultiFunctionWidgetOverlayMode({ selected: true, editing: false, locked: false }),
    {
      bodyInteractive: true,
      moveHandleInteractive: true,
      resizeHandlesInteractive: true,
      zIndex: 12,
    },
  )

  assert.deepEqual(
    getMultiFunctionWidgetOverlayMode({ selected: true, editing: true, locked: false }),
    {
      bodyInteractive: false,
      moveHandleInteractive: true,
      resizeHandlesInteractive: true,
      zIndex: 6,
    },
  )
})

test('clampWidgetToLayerBounds keeps child widgets inside multi-function widget bounds', () => {
  const widget: DashWidget = {
    id: 'widget-a',
    type: 'text',
    col: 5,
    row: 3,
    colSpan: 4,
    rowSpan: 3,
  }

  assert.deepEqual(clampWidgetToLayerBounds(widget, createGroup()), {
    ...widget,
    col: 2,
    row: 1,
    colSpan: 4,
    rowSpan: 3,
  })
})

test('isValidMultiFunctionWidgetPlacement blocks collisions with page widgets and sibling multi-function widgets', () => {
  const page = createPage({
    widgets: [{ id: 'top-level', type: 'text', col: 0, row: 0, colSpan: 4, rowSpan: 2 }],
    wrapperGroups: [createGroup()],
  })

  assert.equal(
    isValidMultiFunctionWidgetPlacement(
      { col: 1, row: 0, colSpan: 6, rowSpan: 4 },
      page,
      20,
      12,
    ),
    false,
  )
  assert.equal(
    isValidMultiFunctionWidgetPlacement(
      { col: 4, row: 2, colSpan: 6, rowSpan: 4 },
      page,
      20,
      12,
    ),
    false,
  )
  assert.equal(
    isValidMultiFunctionWidgetPlacement(
      { col: 12, row: 6, colSpan: 6, rowSpan: 4 },
      page,
      20,
      12,
    ),
    true,
  )
})
