import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const controllerSource = readFileSync(new URL('./useDashEditorController.ts', import.meta.url), 'utf8')

test('alerts tab effect does not recreate page edit context every render', () => {
  assert.match(controllerSource, /if \(activeTab === 'alerts'\) \{/)
  assert.match(controllerSource, /if \(editContext\.kind !== 'page'\) \{\s*setEditContext\(createPageEditContext\(\)\)\s*\}/)
  assert.match(controllerSource, /\[activeTab, currentPage, editContext\.kind, selectedLayerId, selectedWidgetStackId, widgetStacks, widgetStackLayerSelections\]/)
})
