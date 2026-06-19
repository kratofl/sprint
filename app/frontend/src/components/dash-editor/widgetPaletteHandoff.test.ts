import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const paletteSource = readFileSync(new URL('./WidgetPalette.tsx', import.meta.url), 'utf8')

test('widget selector follows the Sprint handoff category model', () => {
  for (const category of ['driving', 'timing', 'car_settings', 'race', 'info']) {
    assert.match(paletteSource, new RegExp(`['"]${category}['"]`))
  }

  assert.doesNotMatch(paletteSource, /LOADING_CATALOG|font-mono text-\[9px\] font-bold uppercase/)
})

test('widget selector renders responsive 54px reference tiles', () => {
  assert.match(paletteSource, /grid-cols-2/)
  assert.match(paletteSource, /h-\[54px\]/)
  assert.match(paletteSource, /min-w-0/)
  assert.match(paletteSource, /flex-col/)
  assert.match(paletteSource, /Search widgets/)
  assert.match(paletteSource, /Drag onto the grid to place/)
  assert.match(paletteSource, /\bInput\b/)
  assert.match(paletteSource, /\bTile\b/)
  assert.doesNotMatch(paletteSource, /<input\b/)
  assert.doesNotMatch(paletteSource, /border-\[var\(--border\)\] bg-\[var\(--panel-2\)\]/)
})
