import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dashEditModeSource = readFileSync(
  new URL('../DashEditMode.tsx', import.meta.url),
  'utf8',
)

test('dash editor uses the reference left rail and properties rail model', () => {
  assert.match(dashEditModeSource, /type EditorLeftRailView = 'pages' \| 'widgets'/)
  assert.match(dashEditModeSource, /const \[leftRailView, setLeftRailView\] = useState<EditorLeftRailView>\('widgets'\)/)
  assert.match(dashEditModeSource, /<EditorLeftRail/)
  assert.match(dashEditModeSource, /<EditorPropertiesRail/)
  assert.match(dashEditModeSource, /Pages/)
  assert.match(dashEditModeSource, /Widgets/)
  assert.doesNotMatch(dashEditModeSource, /title="WIDGETS"/)
  assert.doesNotMatch(dashEditModeSource, /title=\{inspectorState\.title\}/)
})

test('dash editor removes docked overlay sidebar preferences from the primary layout', () => {
  assert.doesNotMatch(dashEditModeSource, /<EditorEdgeHandle/)
  assert.doesNotMatch(dashEditModeSource, /<EditorSidebar/)
  assert.doesNotMatch(dashEditModeSource, /data-palette-docked=/)
  assert.doesNotMatch(dashEditModeSource, /data-inspector-docked=/)
})

test('focus mode renders a dedicated stack workspace header with compare controls', () => {
  assert.match(dashEditModeSource, /<FocusModeHeader/)
  assert.match(dashEditModeSource, /Back to page/)
  assert.match(dashEditModeSource, /COMPARE/)
  assert.match(dashEditModeSource, /REFERENCE LAYER/)
})

test('dash editor no longer exposes terminal-style underscore command labels', () => {
  for (const legacyLabel of ['BACK_TO_PAGE', 'ADD_LAYER', 'CLEAR_LAYER', 'DELETE_STACK', 'ADVANCED_GEOMETRY', 'REMOVE_WIDGET', 'SET_REF']) {
    assert.doesNotMatch(dashEditModeSource, new RegExp(legacyLabel))
  }
})

test('focus mode active layer uses a full-stage live preview viewport', () => {
  assert.doesNotMatch(dashEditModeSource, /const focusPreviewCrop = controller\.selectedWidgetStack/)
  assert.match(dashEditModeSource, /function CanvasViewport\(/)
  assert.match(dashEditModeSource, /className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-\[16px\] border border-\[var\(--line\)\] bg-\[var\(--bg-deep\)\]"/)
  assert.match(dashEditModeSource, /<CanvasViewport screenW=\{controller\.screenW\} screenH=\{controller\.screenH\}>/)
  assert.match(dashEditModeSource, /previewUrl=\{controller\.previewUrl \?\? undefined\}/)
  assert.doesNotMatch(dashEditModeSource, /previewCrop=\{focusPreviewCrop\}/)
  assert.match(dashEditModeSource, /<DashCanvas\s+fillParent/)
})
