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

test('dash editor list, alert, and preview chrome uses Graphite panels', () => {
  assert.match(dashListSource, /\bds-page\b/)
  assert.match(dashListSource, /\bds-dash-grid\b/)
  assert.match(dashListSource, /\bds-dash-card\b/)
  assert.match(dashListSource, /\bds-dash-create\b/)
  assert.match(dashListSource, /\bds-dash-preview\b/)
  assert.match(dashListSource, /\bBadge\b/)
  assert.doesNotMatch(dashListSource, /\bds-pill\b/)
  // Alert catalog tiles use flat panel tokens (toggle-tile redesign, PRD #106):
  // a rounded alert surface on the standard panel token, no legacy/Graphite fills.
  assert.match(alertsEditorSource, /rounded-alert/)
  assert.match(alertsEditorSource, /border-\[var\(--border\)\] bg-\[var\(--panel\)\]/)
  assert.match(alertsEditorSource, /aria-label=\{`Toggle \$\{meta\.label\}`\}/)
  assert.match(widgetPreviewSource, /rounded-alert border border-\[var\(--border\)\] bg-\[var\(--panel-2\)\]/)
  assert.match(`${dashListSource}\n${widgetPreviewSource}`, /font-saira text-\[1[02]px\] tabular-nums text-\[var\(--muted/)
  assert.doesNotMatch(`${dashListSource}\n${alertsEditorSource}`, /bg-bg-container|bg-bg-panel|border-border-input|shadow-lg/)
})
