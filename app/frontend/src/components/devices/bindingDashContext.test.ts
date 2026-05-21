import test from 'node:test'
import assert from 'node:assert/strict'

import type { LayoutMeta, SavedDevice } from '@/lib/dash'
import { resolveBindingDashContext } from './bindingDashContext.ts'

function createLayout(id: string, name: string): LayoutMeta {
  return {
    id,
    name,
    default: false,
    pageCount: 1,
    gridCols: 20,
    gridRows: 12,
    previewAvailable: false,
  }
}

function createDevice(overrides: Partial<SavedDevice> = {}): SavedDevice {
  return {
    vid: 1,
    pid: 2,
    serial: 'serial-a',
    type: 'wheel',
    width: 0,
    height: 0,
    name: 'Wheel',
    rotation: 0,
    targetFps: 30,
    offsetX: 0,
    offsetY: 0,
    margin: 0,
    driver: 'vocore',
    dashId: '',
    purpose: 'dash',
    bindings: [],
    disabled: false,
    ...overrides,
  }
}

test('resolveBindingDashContext lets non-screen devices choose which dash MFW bindings are shown', () => {
  const layouts = [
    createLayout('layout-default', 'Default'),
    createLayout('layout-race', 'Race'),
  ]

  const context = resolveBindingDashContext({
    device: createDevice({ type: 'buttonbox' }),
    layouts,
    selectedDashId: 'layout-race',
  })

  assert.equal(context.activeDashId, 'layout-race')
  assert.equal(context.showDashPicker, true)
})

test('resolveBindingDashContext falls back to the first layout when a non-screen selected dash no longer exists', () => {
  const layouts = [
    createLayout('default', 'Default'),
  ]

  const context = resolveBindingDashContext({
    device: createDevice({ type: 'wheel', dashId: 'stale-layout' }),
    layouts,
    selectedDashId: 'stale-layout',
  })

  assert.equal(context.activeDashId, 'default')
  assert.equal(context.showDashPicker, true)
})

test('resolveBindingDashContext keeps screen devices pinned to their assigned dash', () => {
  const layouts = [
    createLayout('layout-default', 'Default'),
    createLayout('layout-race', 'Race'),
  ]

  const context = resolveBindingDashContext({
    device: createDevice({ type: 'screen', dashId: 'layout-race' }),
    layouts,
    selectedDashId: 'layout-default',
  })

  assert.equal(context.activeDashId, 'layout-race')
  assert.equal(context.showDashPicker, false)
})
