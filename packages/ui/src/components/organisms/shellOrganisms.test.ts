import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const navRailSource = readFileSync(new URL('./NavRail.tsx', import.meta.url), 'utf8')
const pageHeaderSource = readFileSync(new URL('./PageHeader.tsx', import.meta.url), 'utf8')
const statusStripSource = readFileSync(new URL('./StatusStrip.tsx', import.meta.url), 'utf8')

test('nav rail follows the Sprint handoff row scale', () => {
  assert.match(navRailSource, /NavRailSection/)
  assert.match(navRailSource, /w-full/)
  assert.match(navRailSource, /h-8/)
  assert.match(navRailSource, /gap-\[10px\]/)
  assert.match(navRailSource, /px-\[10px\]/)
  assert.match(navRailSource, /rounded-control/)
  assert.match(navRailSource, /text-\[13px\]/)
  assert.match(navRailSource, /border-\[var\(--orange\)\]/)
  assert.match(navRailSource, /bg-\[var\(--panel-3\)\]/)
  assert.doesNotMatch(navRailSource, /w-\[236px\]|IconChevron|showCollapseToggle/)
  assert.doesNotMatch(navRailSource, /focus-visible:ring-1|transition-\[width\]/)
})

test('page header and status strip use Figma flat chrome', () => {
  assert.match(pageHeaderSource, /rounded-panel/)
  assert.match(pageHeaderSource, /border-\[var\(--border\)\]/)
  assert.match(pageHeaderSource, /bg-\[var\(--panel\)\]/)
  assert.match(pageHeaderSource, /p-\[14px\]/)
  assert.match(pageHeaderSource, /text-\[13px\]/)

  assert.match(statusStripSource, /bg-\[var\(--panel\)\]/)
  assert.match(statusStripSource, /font-saira/)
  assert.match(statusStripSource, /tabular-nums/)
})
