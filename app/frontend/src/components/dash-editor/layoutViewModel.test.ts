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
  defaultVariantId: 'layer-2',
  variants: [
    { id: 'layer-1', name: 'Layer 1', widgets: [] },
    { id: 'layer-2', name: 'Layer 2', widgets: [] },
    { id: 'layer-3', name: 'Layer 3', widgets: [] },
  ],
}

test('layer strip is hidden in page mode and encodes selection/default/reorder in mfw mode', () => {
  assert.equal(createLayerStripState({ mode: 'page', selectedWrapperGroup: group, selectedVariantId: 'layer-2' }), null)

  const state = createLayerStripState({ mode: 'mfw', selectedWrapperGroup: group, selectedVariantId: 'layer-2' })

  assert.ok(state)
  assert.equal(state?.groupName, 'Fuel Stack')
  assert.deepEqual(state.layers.map(layer => layer.name), ['Layer 1', 'Layer 2', 'Layer 3'])
  assert.equal(state.layers[0].canMoveLeft, false)
  assert.equal(state.layers[1].selected, true)
  assert.equal(state.layers[1].isDefault, true)
  assert.equal(state.layers[2].canMoveRight, false)
})

test('inspector sheet content stays mode-aware and only exposes geometry for widget or mfw editing', () => {
  const pageState = createInspectorSheetState({
    mode: 'page',
    selectedWidget: null,
    selectedWrapperGroup: null,
    pageName: 'Main',
  })
  const widgetState = createInspectorSheetState({
    mode: 'page',
    selectedWidget: { id: 'w-1', type: 'speed', col: 0, row: 0, colSpan: 4, rowSpan: 2 },
    selectedWrapperGroup: null,
    pageName: 'Main',
  })
  const mfwState = createInspectorSheetState({
    mode: 'mfw',
    selectedWidget: null,
    selectedWrapperGroup: group,
    pageName: 'Main',
  })

  assert.equal(pageState.showAdvancedGeometry, false)
  assert.equal(pageState.title, 'PAGE · Main')
  assert.equal(widgetState.showAdvancedGeometry, true)
  assert.equal(widgetState.title, 'WIDGET · speed')
  assert.equal(mfwState.showAdvancedGeometry, true)
  assert.equal(mfwState.title, 'MFW · Fuel Stack')
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
