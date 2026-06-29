import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const navRailSource = readFileSync(new URL('./NavRail.tsx', import.meta.url), 'utf8')
const pageHeaderSource = readFileSync(new URL('./PageHeader.tsx', import.meta.url), 'utf8')
const statusStripSource = readFileSync(new URL('./StatusStrip.tsx', import.meta.url), 'utf8')
const appShellSource = readFileSync(new URL('./AppShell.tsx', import.meta.url), 'utf8')
const titlebarSource = readFileSync(new URL('./Titlebar.tsx', import.meta.url), 'utf8')
const bodyTraySource = readFileSync(new URL('./BodyTray.tsx', import.meta.url), 'utf8')

test('nav rail follows the Figma Navigation Item anatomy', () => {
  assert.match(navRailSource, /NavRailSection/)
  assert.match(navRailSource, /w-full/)
  // Figma Navigation Item: h32, pad 8×10, gap 10, radius pill, Inter Medium 13.
  assert.match(navRailSource, /h-\[32px\]/)
  assert.match(navRailSource, /gap-\[10px\]/)
  assert.match(navRailSource, /px-\[10px\]/)
  assert.match(navRailSource, /rounded-\[999px\]/)
  assert.match(navRailSource, /text-\[13px\]/)
  // Selected: bg Surface/Tile2 + accent text (no left accent bar in Figma).
  assert.match(navRailSource, /bg-\[var\(--panel3\)\]/)
  assert.match(navRailSource, /text-\[var\(--accent\)\]/)
  assert.match(navRailSource, /type="button"/)
  assert.match(navRailSource, /aria-current=\{isActive \? "page" : undefined\}/)
  assert.doesNotMatch(navRailSource, /w-\[236px\]|IconChevron|before:w-\[3px\]/)
})

test('nav rail supports unlabeled top groups and labeled device groups', () => {
  assert.match(navRailSource, /label\?:\s*string/)
  assert.match(navRailSource, /section\.label &&/)
  assert.match(navRailSource, /section\.label \?\? section\.items\.map/)
})

test('page header emits the shared ds-head structure', () => {
  assert.match(pageHeaderSource, /\bds-head\b/)
  assert.match(pageHeaderSource, /<h1/)
  assert.match(pageHeaderSource, /\bds-acts\b/)
  assert.doesNotMatch(pageHeaderSource, /rounded-\[var\(--r\)\]/)
  assert.doesNotMatch(pageHeaderSource, /border border-\[var\(--line\)\]/)
  assert.doesNotMatch(pageHeaderSource, /bg-\[var\(--panel\)\]/)
  assert.doesNotMatch(pageHeaderSource, /p-\[16px\]/)

  assert.match(statusStripSource, /bg-\[var\(--panel\)\]/)
  assert.match(statusStripSource, /font-sans/)
  assert.match(statusStripSource, /tabular-nums/)
})

test('app shell owns the desktop frame, collapsible sidebar, and body slot', () => {
  assert.match(appShellSource, /data-slot="app-shell"/)
  assert.match(appShellSource, /fd tone-graphite/)
  assert.match(appShellSource, /sidebarCollapsed/)
  assert.match(appShellSource, /data-collapsed=\{sidebarCollapsed\}/)
  // Figma sidebar: 220px expanded; collapsed rail.
  assert.match(appShellSource, /w-\[72px\]/)
  assert.match(appShellSource, /w-\[220px\]/)
  // Figma sidebar is flush to the window with only its inner (right) corners rounded.
  assert.match(appShellSource, /rounded-r-\[18px\]/)
  assert.match(appShellSource, /sidebar:\s*React\.ReactNode/)
  assert.match(appShellSource, /children:\s*React\.ReactNode/)
  // The single header now lives in the content column, not a full-width titlebar.
  assert.doesNotMatch(appShellSource, /titlebar:\s*React\.ReactNode/)
  assert.doesNotMatch(appShellSource, /windowAPI|Wails|wailsjs/)
})

test('titlebar exposes composition slots without importing desktop runtime code', () => {
  for (const slot of ['logo', 'navigation', 'breadcrumb', 'status', 'metrics', 'windowControls']) {
    assert.match(titlebarSource, new RegExp(`${slot}\\?:\\s*React\\.ReactNode`), `${slot} slot is missing`)
  }

  assert.match(titlebarSource, /data-slot="titlebar"/)
  assert.match(titlebarSource, /h-10/)
  assert.match(titlebarSource, /border-b/)
  assert.match(titlebarSource, /bg-\[var\(--panel\)\]/)
  assert.doesNotMatch(titlebarSource, /windowAPI|Wails|wailsjs/)
})

test('body tray owns the inset page frame and main landmark chrome', () => {
  assert.match(bodyTraySource, /data-slot="body-tray"/)
  assert.match(bodyTraySource, /<main/)
  assert.match(bodyTraySource, /rounded-\[calc\(var\(--r\)\+2px\)\]/)
  assert.match(bodyTraySource, /border-\[var\(--line2\)\]/)
  assert.match(bodyTraySource, /bg-\[var\(--bg\)\]/)
  assert.doesNotMatch(bodyTraySource, /windowAPI|Wails|wailsjs/)
})
