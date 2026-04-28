import test from 'node:test'
import assert from 'node:assert/strict'

import { adaptCatalogEntry, adaptGlobalDashSettings, adaptLayout, adaptSavedDevice, adaptWidgetCatalogEntry } from './adapters.ts'

test('adaptSavedDevice maps snake_case desktop payloads into camelCase frontend models', () => {
  const adapted = adaptSavedDevice({
    vid: 0x1234,
    pid: 0x5678,
    serial: 'wheel-a',
    type: 'screen',
    width: 800,
    height: 480,
    name: 'Primary dash',
    rotation: 90,
    target_fps: 60,
    offset_x: 12,
    offset_y: 34,
    margin: 5,
    driver: 'vocore',
    dash_id: 'main-layout',
    purpose: 'rear_view',
    purpose_config: {
      capture_x: 10,
      capture_y: 20,
      capture_w: 300,
      capture_h: 120,
      idle_mode: 'clock',
    },
    bindings: [{ button: 4, command: 'dash.page.next' }],
    disabled: true,
  })

  assert.deepEqual(adapted, {
    vid: 0x1234,
    pid: 0x5678,
    serial: 'wheel-a',
    type: 'screen',
    width: 800,
    height: 480,
    name: 'Primary dash',
    rotation: 90,
    targetFps: 60,
    offsetX: 12,
    offsetY: 34,
    margin: 5,
    driver: 'vocore',
    dashId: 'main-layout',
    purpose: 'rear_view',
    purposeConfig: {
      captureX: 10,
      captureY: 20,
      captureW: 300,
      captureH: 120,
      idleMode: 'clock',
    },
    bindings: [{ button: 4, command: 'dash.page.next' }],
    disabled: true,
  })
})

test('adaptCatalogEntry preserves optional bindings and defaults the purpose to dash', () => {
  const adapted = adaptCatalogEntry({
    id: 'generic-vocore',
    name: 'Generic VoCore',
    description: 'Fallback entry',
    type: 'screen',
    vid: 0,
    pid: 0,
    width: 800,
    height: 480,
    rotation: 0,
    driver: 'vocore',
  })

  assert.equal(adapted.purpose, 'dash')
  assert.deepEqual(adapted.bindings, [])
  assert.equal(adapted.margin, 0)
})

test('adaptLayout maps wrapper groups, page backgrounds, and typography settings', () => {
  const adapted = adaptLayout({
    id: 'layout-a',
    name: 'Race',
    default: false,
    gridCols: 20,
    gridRows: 12,
    idlePage: { id: 'idle', name: 'Idle', widgets: [] },
    pages: [{
      id: 'page-main',
      name: 'Main',
      background: { R: 1, G: 2, B: 3, A: 255 },
      widgets: [],
      wrapperGroups: [{
        id: 'stack',
        name: 'Stack',
        col: 4,
        row: 3,
        colSpan: 8,
        rowSpan: 3,
        defaultVariantId: 'variant-a',
        variants: [{
          id: 'variant-a',
          name: 'A',
          widgets: [{ id: 'inner', type: 'text', col: 0, row: 0, colSpan: 8, rowSpan: 3 }],
        }],
      }],
    }],
    typography: {
      font: 'bold',
      labelFont: 'mono',
      fontScale: 1.2,
    },
  })

  assert.equal(adapted.pages[0].background?.R, 1)
  assert.equal(adapted.pages[0].wrapperGroups?.[0]?.defaultVariantId, 'variant-a')
  assert.equal(adapted.pages[0].wrapperGroups?.[0]?.variants?.[0]?.widgets?.[0]?.type, 'text')
  assert.equal(adapted.typography?.font, 'bold')
  assert.equal(adapted.typography?.fontScale, 1.2)
})

test('adaptGlobalDashSettings includes typography defaults', () => {
  const adapted = adaptGlobalDashSettings({
    theme: { primary: { R: 1, G: 2, B: 3, A: 255 } },
    domainPalette: {},
    typography: {
      font: 'number',
      labelFont: 'label',
      fontScale: 1.1,
    },
  })

  assert.equal(adapted.typography?.font, 'number')
  assert.equal(adapted.typography?.labelFont, 'label')
  assert.equal(adapted.typography?.fontScale, 1.1)
})

test('adaptWidgetCatalogEntry flattens Go text styles for widget previews', () => {
  const adapted = adaptWidgetCatalogEntry({
    type: 'tc',
    name: 'Traction Control',
    category: 'car',
    defaultDefinition: [
      {
        kind: 'text',
        text: 'TC1',
        x: 0.025,
        y: 0.08,
        style: {
          font: 'ui',
          fontSize: 0.14,
          hAlign: 0,
          vAlign: 0,
          color: { ref: 'muted' },
        },
      },
      {
        kind: 'text',
        binding: 'electronics.tc',
        x: 0.5,
        y: 0.6,
        style: {
          font: 'mono',
          fontSize: 0.45,
          bold: true,
          hAlign: 1,
          vAlign: 1,
          color: { ref: 'fg' },
        },
      },
    ],
  })

  assert.equal(adapted.defaultDefinition?.[0]?.font, 'label')
  assert.equal(adapted.defaultDefinition?.[0]?.fontScale, 0.14)
  assert.equal(adapted.defaultDefinition?.[0]?.x, 0.025)
  assert.equal(adapted.defaultDefinition?.[0]?.y, 0.08)
  assert.equal(adapted.defaultDefinition?.[0]?.hAlign, 0)
  assert.equal(adapted.defaultDefinition?.[0]?.vAlign, 0)
  assert.deepEqual(adapted.defaultDefinition?.[0]?.color, { ref: 'muted' })
  assert.equal('style' in (adapted.defaultDefinition?.[0] ?? {}), false)

  assert.equal(adapted.defaultDefinition?.[1]?.font, 'number')
  assert.equal(adapted.defaultDefinition?.[1]?.fontScale, 0.45)
  assert.equal(adapted.defaultDefinition?.[1]?.x, 0.5)
  assert.equal(adapted.defaultDefinition?.[1]?.y, 0.6)
  assert.equal(adapted.defaultDefinition?.[1]?.hAlign, 1)
  assert.equal(adapted.defaultDefinition?.[1]?.vAlign, 1)
})
