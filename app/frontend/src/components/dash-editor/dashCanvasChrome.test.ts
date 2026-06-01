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

test('dash canvas can fill the focus stage while cropping a shared preview frame', () => {
  assert.match(dashCanvasSource, /fillParent\?: boolean/)
  assert.match(dashCanvasSource, /previewCrop\?:/)
  assert.match(dashCanvasSource, /fillParent && 'h-full'/)
  assert.match(dashCanvasSource, /const hasPreviewCrop = previewCrop/)
})
