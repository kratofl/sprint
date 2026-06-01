import test from 'node:test'
import assert from 'node:assert/strict'

import type { DashPage, DashWidget, DashWidgetStack } from '../../lib/dash/types.ts'
import {
  clampWidgetToLayerBounds,
  createClearedWidgetStackSelectionState,
  createWidgetStackOnDrop,
  createPageEditContext,
  createWidgetStackEditState,
  createWidgetStackSelectionState,
  enterWidgetStackMode,
  exitToPageEditMode,
  getWidgetStackOverlayMode,
  getPaletteDropTarget,
  isValidWidgetStackPlacement,
} from './multiFunctionWidgetState.ts'

function createPage(overrides: Partial<DashPage> = {}): DashPage {
  return {
    id: 'page-main',
    name: 'Main',
    widgets: [],
    widgetStacks: [],
    ...overrides,
  }
}

function createGroup(overrides: Partial<DashWidgetStack> = {}): DashWidgetStack {
  return {
    id: 'group-a',
    name: 'Stack',
    col: 2,
    row: 1,
    colSpan: 6,
    rowSpan: 4,
    defaultLayerId: 'layer-a',
    layers: [{ id: 'layer-a', name: 'Layer 1', widgets: [] }],
    ...overrides,
  }
}

test('createWidgetStackOnDrop adds a default-sized multi-function widget and enters layer mode', () => {
  const page = createPage()
  let nextID = 0

  const result = createWidgetStackOnDrop({
    page,
    drop: { col: 18, row: 10 },
    gridCols: 20,
    gridRows: 12,
    createID: () => {
      nextID += 1
      return `generated-id-${nextID}`
    },
  })

  assert.equal(result.page.widgetStacks?.length, 1)
  assert.deepEqual(result.page.widgetStacks?.[0], {
    id: 'generated-id-1',
    name: 'Widget Stack 1',
    col: 14,
    row: 8,
    colSpan: 6,
    rowSpan: 4,
    defaultLayerId: 'generated-id-2',
    layers: [{ id: 'generated-id-2', name: 'Layer 1', widgets: [] }],
  })
  assert.deepEqual(result.context, {
    kind: 'widget-stack',
    groupId: 'generated-id-1',
    layerId: 'generated-id-2',
  })
})

test('enterWidgetStackMode resolves the active layer and exitToPageEditMode leaves it', () => {
  const page = createPage({ widgetStacks: [createGroup()] })

  const context = enterWidgetStackMode(page, 'group-a', { 'page-main:group-a': 'layer-a' })

  assert.deepEqual(context, {
    kind: 'widget-stack',
    groupId: 'group-a',
    layerId: 'layer-a',
  })
  assert.deepEqual(exitToPageEditMode(), createPageEditContext())
})

test('createWidgetStackSelectionState keeps page mode active while selecting a multi-function widget', () => {
  const page = createPage({ widgetStacks: [createGroup()] })

  assert.deepEqual(
    createWidgetStackSelectionState(page, 'group-a', { 'page-main:group-a': 'layer-a' }),
    {
      selectedWidgetStackId: 'group-a',
      selectedLayerId: 'layer-a',
      editContext: createPageEditContext(),
    },
  )
})

test('createWidgetStackEditState enters multi-function widget edit mode explicitly', () => {
  const page = createPage({ widgetStacks: [createGroup()] })

  assert.deepEqual(
    createWidgetStackEditState(page, 'group-a', { 'page-main:group-a': 'layer-a' }),
    {
      selectedWidgetStackId: 'group-a',
      selectedLayerId: 'layer-a',
      editContext: {
        kind: 'widget-stack',
        groupId: 'group-a',
        layerId: 'layer-a',
      },
    },
  )
})

test('createClearedWidgetStackSelectionState drops the current selection and exits edit mode', () => {
  assert.deepEqual(createClearedWidgetStackSelectionState(), {
    selectedWidgetStackId: null,
    selectedLayerId: null,
    editContext: createPageEditContext(),
  })
})

test('getPaletteDropTarget routes drops to the page or the active layer based on edit context', () => {
  assert.deepEqual(getPaletteDropTarget(createPageEditContext()), { scope: 'page' })
  assert.deepEqual(
    getPaletteDropTarget({ kind: 'widget-stack', groupId: 'group-a', layerId: 'layer-a' }),
    { scope: 'layer', groupId: 'group-a', layerId: 'layer-a' },
  )
})

test('getWidgetStackOverlayMode stops the STACK body from capturing input during layer edit mode', () => {
  assert.deepEqual(
    getWidgetStackOverlayMode({ selected: true, editing: false, locked: false }),
    {
      bodyInteractive: true,
      moveHandleInteractive: true,
      resizeHandlesInteractive: true,
      zIndex: 12,
    },
  )

  assert.deepEqual(
    getWidgetStackOverlayMode({ selected: true, editing: true, locked: false }),
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

test('isValidWidgetStackPlacement blocks collisions with page widgets and sibling multi-function widgets', () => {
  const page = createPage({
    widgets: [{ id: 'top-level', type: 'text', col: 0, row: 0, colSpan: 4, rowSpan: 2 }],
    widgetStacks: [createGroup()],
  })

  assert.equal(
    isValidWidgetStackPlacement(
      { col: 1, row: 0, colSpan: 6, rowSpan: 4 },
      page,
      20,
      12,
    ),
    false,
  )
  assert.equal(
    isValidWidgetStackPlacement(
      { col: 4, row: 2, colSpan: 6, rowSpan: 4 },
      page,
      20,
      12,
    ),
    false,
  )
  assert.equal(
    isValidWidgetStackPlacement(
      { col: 12, row: 6, colSpan: 6, rowSpan: 4 },
      page,
      20,
      12,
    ),
    true,
  )
})
