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
    /className="flex h-full self-stretch items-stretch \[--wails-draggable:nodrag\]"/,
  )
})

test('settings and help stay in their own centered group next to the stretched window controls', () => {
  assert.match(
    appSource,
    /className="flex h-full self-stretch items-stretch \[--wails-draggable:nodrag\]"[\s\S]{0,220}className="flex items-center gap-1"/,
  )
})
