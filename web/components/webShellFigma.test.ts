import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const globalsSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const navSource = readFileSync(new URL('./WebNavRail.tsx', import.meta.url), 'utf8')

test('web shell imports shared Figma tokens and uses flat app layout', () => {
  assert.match(globalsSource, /@import ["']@sprint\/tokens\/globals\.css["']/)
  assert.match(layoutSource, /bg-\[var\(--bg\)\]/)
  assert.match(layoutSource, /font-inter/)
  assert.match(layoutSource, /p-\[14px\]/)
})

test('web nav rows match Figma sidebar metrics', () => {
  assert.match(navSource, /h-8/)
  assert.match(navSource, /gap-\[10px\]/)
  assert.match(navSource, /rounded-control/)
  assert.match(navSource, /border-\[var\(--orange\)\]/)
  assert.match(navSource, /bg-\[var\(--panel-3\)\]/)
})
