import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dashEditModeSource = readFileSync(
  new URL('../DashEditMode.tsx', import.meta.url),
  'utf8',
)

const dashCanvasSource = readFileSync(
  new URL('../DashCanvas.tsx', import.meta.url),
  'utf8',
)

test('dash editor canvas wrapper stays visually passive', () => {
  const canvasPaneBlock = dashEditModeSource.match(/ref=\{controller\.canvasPaneRef\}[\s\S]{0,260}/)?.[0] ?? ''

  assert.equal(canvasPaneBlock.length > 0, true)
  assert.doesNotMatch(canvasPaneBlock, /\bsurface-shell\b/)
  assert.doesNotMatch(canvasPaneBlock, /\bborder-border(?:-strong)?\b/)
  assert.doesNotMatch(canvasPaneBlock, /shadow-\[inset_/)
})

test('dash editor designer uses the Figma three-column layout and VoCore canvas metrics', () => {
  assert.match(dashEditModeSource, /<EditorLeftRail/)
  assert.match(dashEditModeSource, /<EditorPropertiesRail/)
  assert.match(dashEditModeSource, /screenW=\{controller\.screenW\}/)
  assert.match(dashEditModeSource, /screenH=\{controller\.screenH\}/)
  assert.match(dashCanvasSource, /DEFAULT_SCREEN_W = 800/)
  assert.match(dashCanvasSource, /DEFAULT_SCREEN_H = 480/)
})

test('dash editor canvas stage matches the Figma reference board', () => {
  assert.match(dashEditModeSource, /\bds-reference-canvas\b/)
  assert.match(dashEditModeSource, /data-scale=\{editorScale\}/)
  assert.match(dashEditModeSource, /label="Editor scale"/)
  assert.match(dashEditModeSource, /label: '100%'/)
  assert.match(dashCanvasSource, /showGrid\?: boolean/)
})

test('dash editor canvas wrapper clears selection only for direct empty-space clicks', () => {
  const canvasPaneBlock = dashEditModeSource.match(/ref=\{controller\.canvasPaneRef\}[\s\S]{0,420}/)?.[0] ?? ''

  assert.equal(canvasPaneBlock.length > 0, true)
  assert.match(canvasPaneBlock, /onClick=\{\(event\) => \{/)
  assert.match(canvasPaneBlock, /event\.target === event\.currentTarget/)
  assert.match(canvasPaneBlock, /controller\.handleCanvasBackgroundClick\(\)/)
})

test('dash canvas keeps the only visible frame', () => {
  assert.match(dashCanvasSource, /className=\{cn\('relative w-full overflow-hidden border border-border bg-black', fillParent && 'h-full'\)\}/)
  assert.doesNotMatch(dashCanvasSource, /className="relative w-full overflow-hidden border border-border-strong bg-black"/)
})

test('selected widget stacks expose inline context with an open action on the page canvas', () => {
  assert.match(dashCanvasSource, /rect\.actionLabel/)
  assert.match(dashCanvasSource, /Current \{rect\.secondaryDetail\}/)
})

test('selected widgets use Figma orange outline and badge chrome', () => {
  assert.match(dashCanvasSource, /outline outline-2 outline-\[var\(--orange\)\]/)
  assert.match(dashCanvasSource, /rounded-badge bg-\[var\(--orange\)\]/)
  assert.match(dashCanvasSource, /font-saira-sc text-\[10px\] font-bold uppercase/)
  assert.doesNotMatch(dashCanvasSource, /ring-primary\/30/)
})

test('canvas ghost and resize states use tokenized Figma signal colors', () => {
  assert.match(dashCanvasSource, /ghost\.valid \? 'var\(--orange\)' : 'var\(--red\)'/)
  assert.match(dashCanvasSource, /color-mix\(in srgb, var\(--orange\) 12%, transparent\)/)
  assert.match(dashCanvasSource, /background:\s+'var\(--orange\)'/)
  assert.doesNotMatch(dashCanvasSource, /#F87171/)
  assert.doesNotMatch(dashCanvasSource, /var\(--accent\)/)
})

test('dash canvas can fill the focus stage while cropping a shared preview frame', () => {
  assert.match(dashCanvasSource, /fillParent\?: boolean/)
  assert.match(dashCanvasSource, /previewCrop\?:/)
  assert.match(dashCanvasSource, /fillParent && 'h-full'/)
  assert.match(dashCanvasSource, /const hasPreviewCrop = previewCrop/)
})
