import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInspectorSheetState,
  createLayerStripState,
  createToolPanelPresentationState,
  reduceInspectorPanelOpenState,
} from './layoutViewModel.ts'

const group = {
  id: 'group-1',
  name: 'Fuel Stack',
  col: 0,
  row: 0,
  colSpan: 6,
  rowSpan: 4,
  defaultLayerId: 'layer-2',
  layers: [
    { id: 'layer-1', name: 'Layer 1', widgets: [] },
    { id: 'layer-2', name: 'Layer 2', widgets: [] },
    { id: 'layer-3', name: 'Layer 3', widgets: [] },
  ],
}

test('layer strip is hidden in page mode and encodes selection/default/reorder in focus mode', () => {
  assert.equal(createLayerStripState({ mode: 'page', selectedWidgetStack: group, selectedLayerId: 'layer-2' }), null)

  const state = createLayerStripState({ mode: 'stack', selectedWidgetStack: group, selectedLayerId: 'layer-2' })

  assert.ok(state)
  assert.equal(state?.stackName, 'Fuel Stack')
  assert.deepEqual(state.layers.map(layer => layer.name), ['Layer 1', 'Layer 2', 'Layer 3'])
  assert.equal(state.layers[0].canMoveLeft, false)
  assert.equal(state.layers[1].selected, true)
  assert.equal(state.layers[1].isDefault, true)
  assert.equal(state.layers[2].canMoveRight, false)
})

test('inspector sheet content stays mode-aware and only exposes geometry for widget or stack editing', () => {
  const pageState = createInspectorSheetState({
    mode: 'page',
    selectedWidget: null,
    selectedWidgetStack: null,
    pageName: 'Main',
  })
  const widgetState = createInspectorSheetState({
    mode: 'page',
    selectedWidget: { id: 'w-1', type: 'speed', col: 0, row: 0, colSpan: 4, rowSpan: 2 },
    selectedWidgetStack: null,
    pageName: 'Main',
  })
  const stackState = createInspectorSheetState({
    mode: 'stack',
    selectedWidget: null,
    selectedWidgetStack: group,
    pageName: 'Main',
  })

  assert.equal(pageState.showAdvancedGeometry, false)
  assert.equal(pageState.title, 'PAGE · Main')
  assert.equal(widgetState.showAdvancedGeometry, true)
  assert.equal(widgetState.title, 'speed')
  assert.equal(stackState.showAdvancedGeometry, true)
  assert.equal(stackState.title, 'STACK · Fuel Stack')
})

test('inspector open state never reopens from selection or mode changes after dismissal', () => {
  const closedAfterSelection = reduceInspectorPanelOpenState(false, { type: 'selection-change' })
  const closedAfterMode = reduceInspectorPanelOpenState(false, { type: 'mode-change' })
  const closedAfterPage = reduceInspectorPanelOpenState(false, { type: 'page-change' })

  assert.equal(closedAfterSelection, false)
  assert.equal(closedAfterMode, false)
  assert.equal(closedAfterPage, false)
  assert.equal(reduceInspectorPanelOpenState(false, { type: 'open' }), true)
  assert.equal(reduceInspectorPanelOpenState(true, { type: 'close' }), false)
})

test('tool panel presentation stays compact and falls back to dialog on narrow viewports', () => {
  const desktop = createToolPanelPresentationState(1280)
  const mobile = createToolPanelPresentationState(720)

  assert.deepEqual(desktop, {
    surface: 'popover',
    panelWidth: 352,
    maxHeightVh: 75,
  })
  assert.deepEqual(mobile, {
    surface: 'dialog',
    panelWidth: 336,
    maxHeightVh: 70,
  })
})
