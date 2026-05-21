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
