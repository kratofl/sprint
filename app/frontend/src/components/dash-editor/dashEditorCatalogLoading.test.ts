import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const controllerSource = readFileSync(new URL('./useDashEditorController.ts', import.meta.url), 'utf8')
const dashListSource = readFileSync(new URL('../DashList.tsx', import.meta.url), 'utf8')
const alertsEditorSource = readFileSync(new URL('../AlertsEditor.tsx', import.meta.url), 'utf8')
const widgetPreviewSource = readFileSync(new URL('../WidgetPreview.tsx', import.meta.url), 'utf8')

test('dash editor loads widget catalog independently from device and alert APIs', () => {
  assert.doesNotMatch(
    controllerSource,
    /Promise\.all\(\[\s*widgetCatalogAPI\.getWidgetCatalog\(\),\s*deviceAPI\.getSavedDevices\(\),\s*alertCatalogAPI\.getAlertCatalog\(\),\s*\]\)/,
  )
  assert.match(controllerSource, /widgetCatalogAPI\.getWidgetCatalog\(\)[\s\S]{0,160}setCatalog/)
  assert.match(controllerSource, /deviceAPI\.getSavedDevices\(\)[\s\S]{0,220}setScreenW/)
  assert.match(controllerSource, /alertCatalogAPI\.getAlertCatalog\(\)[\s\S]{0,160}setAlertCatalog/)
})

test('dash editor list, alert, and preview chrome uses Figma panels', () => {
  assert.match(dashListSource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[14px\]/)
  assert.match(alertsEditorSource, /rounded-alert border border-\[var\(--border\)\] bg-\[var\(--panel\)\] p-\[10px\]/)
  assert.match(widgetPreviewSource, /rounded-alert border border-\[var\(--border\)\] bg-\[var\(--panel-2\)\]/)
  assert.match(`${dashListSource}\n${widgetPreviewSource}`, /font-saira text-\[1[02]px\] tabular-nums text-\[var\(--muted/)
  assert.doesNotMatch(`${dashListSource}\n${alertsEditorSource}`, /bg-bg-container|bg-bg-panel|border-border-input|shadow-lg/)
})
