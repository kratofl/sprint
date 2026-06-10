import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const appSource = readFileSync(
  new URL('../App.tsx', import.meta.url),
  'utf8',
)

test('right header cluster stretches window controls to the full titlebar height', () => {
  assert.match(
    appSource,
    /className=\{windowControlsRailClassName\}/,
  )
})

test('desktop titlebar uses the Figma 32px height and product title slots', () => {
  assert.match(appSource, /className="flex h-8 shrink-0/)
  assert.match(appSource, />Sprint</)
  assert.match(appSource, />- Telemetry System</)
})

test('desktop shell exposes Figma frame, sidebar, and content screen metrics', () => {
  assert.match(appSource, /h-\[883px\]/)
  assert.match(appSource, /w-\[1570px\]/)
  assert.match(appSource, /w-\[220px\]/)
  assert.match(appSource, /rounded-panel border border-\[var\(--border\)\] bg-\[var\(--bg\)\] p-\[14px\]/)
})
