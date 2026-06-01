import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const dashEditModeSource = readFileSync(
  new URL('../DashEditMode.tsx', import.meta.url),
  'utf8',
)

const edgeHandleUrl = new URL('./EditorEdgeHandle.tsx', import.meta.url)
const edgeHandleExists = existsSync(edgeHandleUrl)
const edgeHandleSource = edgeHandleExists ? readFileSync(edgeHandleUrl, 'utf8') : ''

test('dash editor replaces full-height strip rails with local edge handles', () => {
  assert.doesNotMatch(dashEditModeSource, /\bEditorTabStrip\b/)
  assert.equal(edgeHandleExists, true)
  assert.match(dashEditModeSource, /<EditorEdgeHandle/)
})

test('dash editor exposes closed-panel handles inside the editor container', () => {
  assert.match(
    dashEditModeSource,
    /!panelPreferences\.palette\.open[\s\S]{0,220}<EditorEdgeHandle[\s\S]{0,120}side="left"/,
  )
  assert.match(
    dashEditModeSource,
    /!panelPreferences\.inspector\.open[\s\S]{0,220}<EditorEdgeHandle[\s\S]{0,120}side="right"/,
  )
})

test('dash editor overlay sidebars no longer keep the old horizontal gutter', () => {
  assert.doesNotMatch(dashEditModeSource, /max-w-\[calc\(100%-1rem\)\][^"\n]*\bpr-2\b/)
  assert.doesNotMatch(dashEditModeSource, /max-w-\[calc\(100%-1rem\)\][^"\n]*\bpl-2\b/)
})

test('editor edge handle stays compact and centered instead of rendering a vertical label rail', () => {
  assert.equal(edgeHandleExists, true)
  assert.match(edgeHandleSource, /data-slot="editor-edge-handle"/)
  assert.match(edgeHandleSource, /top-1\/2/)
  assert.doesNotMatch(edgeHandleSource, /writingMode:\s*'vertical-lr'/)
})

test('widget inspector header no longer prefixes widget titles with WIDGET', () => {
  assert.match(dashEditModeSource, /title=\{inspectorState\.title\}/)
  assert.doesNotMatch(dashEditModeSource, /ADVANCED_GEOMETRY[\s\S]{0,120}headerAction=/)
})

test('focus mode renders a dedicated stack workspace header with compare controls', () => {
  assert.match(dashEditModeSource, /<FocusModeHeader/)
  assert.match(dashEditModeSource, /BACK_TO_PAGE/)
  assert.match(dashEditModeSource, /COMPARE/)
  assert.match(dashEditModeSource, /REFERENCE LAYER/)
})

test('focus mode active layer uses a full-stage live preview viewport', () => {
  assert.doesNotMatch(dashEditModeSource, /const focusPreviewCrop = controller\.selectedWidgetStack/)
  assert.match(dashEditModeSource, /function CanvasViewport\(/)
  assert.match(dashEditModeSource, /className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border bg-bg-shell"/)
  assert.match(dashEditModeSource, /<CanvasViewport screenW=\{controller\.screenW\} screenH=\{controller\.screenH\}>/)
  assert.match(dashEditModeSource, /previewUrl=\{controller\.previewUrl \?\? undefined\}/)
  assert.doesNotMatch(dashEditModeSource, /previewCrop=\{focusPreviewCrop\}/)
  assert.match(dashEditModeSource, /<DashCanvas\s+fillParent/)
})
