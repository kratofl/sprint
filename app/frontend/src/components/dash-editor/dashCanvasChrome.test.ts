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

test('dash canvas keeps the only visible frame', () => {
  assert.match(dashCanvasSource, /className="relative w-full overflow-hidden border border-border bg-black"/)
  assert.doesNotMatch(dashCanvasSource, /className="relative w-full overflow-hidden border border-border-strong bg-black"/)
})
