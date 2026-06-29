import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import * as primitives from './index.ts'

function sourceFor(fileName: string) {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), 'utf8')
}

const indicatorSource = sourceFor('Indicator.tsx')
const statusPillSource = sourceFor('StatusPill.tsx')
const toastSource = sourceFor('Toast.tsx')
const alertSource = sourceFor('Alert.tsx')
const navItemSource = sourceFor('NavigationItem.tsx')

test('wave 3 status/feedback/nav primitives are exported from the package', () => {
  for (const name of ['Indicator', 'StatusPill', 'Toast', 'Alert', 'NavigationItem'] as const) {
    assert.equal(typeof primitives[name], 'function', `${name} is exported`)
  }
})

test('all wave 3 sources stay on tokens and avoid raw hex + decorative effects', () => {
  for (const [name, source] of [
    ['Indicator', indicatorSource],
    ['StatusPill', statusPillSource],
    ['Toast', toastSource],
    ['Alert', alertSource],
    ['NavigationItem', navItemSource],
  ] as const) {
    // No raw hex colors — everything must flow through tokens.
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, `${name} uses tokens, not raw hex`)
    assert.doesNotMatch(
      source,
      /gradient|glass|backdrop-blur|shadow-\[|orb/i,
      `${name} avoids decorative effects`
    )
    assert.doesNotMatch(source, /\bds-/, `${name} avoids ds-* dependencies`)
  }
})

test('Indicator is a token-tinted circle with a 1px colored border and Tabler icon sizes', () => {
  // Circle (radius pill) with a border (the Figma 1px OUTER colored border).
  assert.match(indicatorSource, /rounded-pill/)
  assert.match(indicatorSource, /\bborder\b/)
  // Per-color soft-bg + status-border tokens.
  assert.match(indicatorSource, /bg-\[var\(--green-soft\)\][\s\S]*border|border-\[var\(--primitive-color-green-700\)\]/)
  assert.match(indicatorSource, /border-\[var\(--primitive-color-red-700\)\]/)
  assert.match(indicatorSource, /border-\[var\(--primitive-color-orange-700\)\]/)
  assert.match(indicatorSource, /border-\[var\(--primitive-color-blue-700\)\]/)
  assert.match(indicatorSource, /border-\[var\(--line\)\]/)
  assert.match(indicatorSource, /bg-\[var\(--primitive-color-orange-950\)\]/)
  // 32 → icon 24, 28 → icon 16.
  assert.match(indicatorSource, /size-\[32px\][\s\S]*size-6/)
  assert.match(indicatorSource, /size-\[28px\][\s\S]*size-4/)
  // Five Figma colors.
  for (const color of ['green', 'red', 'orange', 'blue', 'neutral']) {
    assert.match(indicatorSource, new RegExp(`\\b${color}:`), `Indicator exposes ${color}`)
  }
})

test('StatusPill keeps its status API, repoints to status tokens, and carries a live dot', () => {
  assert.match(statusPillSource, /rounded-pill/)
  assert.match(statusPillSource, /bg-\[var\(--panel2\)\]/)
  // Status colors via the new tokens.
  assert.match(statusPillSource, /text-\[var\(--green\)\]/)
  assert.match(statusPillSource, /text-\[var\(--red\)\]/)
  assert.match(statusPillSource, /text-\[var\(--blue\)\]/)
  assert.match(statusPillSource, /text-\[var\(--yellow\)\]/)
  // Live dot paired with the label so color is never the only signal.
  assert.match(statusPillSource, /dotVariants/)
  assert.match(statusPillSource, /aria-hidden="true"/)
  // Existing API preserved.
  for (const status of ['neutral', 'success', 'warning', 'danger', 'info']) {
    assert.match(statusPillSource, new RegExp(`\\b${status}:`), `StatusPill keeps ${status}`)
  }
})

test('Toast is a polite status pill with a leading Indicator and Title/Message styles', () => {
  assert.match(toastSource, /role="status"/)
  assert.match(toastSource, /aria-live="polite"/)
  assert.match(toastSource, /rounded-pill/)
  assert.match(toastSource, /bg-\[var\(--panel2\)\]/)
  // Figma asymmetric pad 6/16/6/8 → py-1.5 pr-4 pl-2, gap 10 → gap-2.5.
  assert.match(toastSource, /py-1\.5/)
  assert.match(toastSource, /pr-4/)
  assert.match(toastSource, /pl-2/)
  assert.match(toastSource, /gap-2\.5/)
  // Leading Indicator (32); success → green, danger → red.
  assert.match(toastSource, /<Indicator/)
  assert.match(toastSource, /size=\{32\}/)
  assert.match(toastSource, /success:\s*"green"/)
  assert.match(toastSource, /danger:\s*"red"/)
  // Title Inter Bold 13 / Message Inter Regular 11.
  assert.match(toastSource, /text-\[13px\] font-bold[\s\S]*text-\[var\(--text\)\]/)
  assert.match(toastSource, /text-\[11px\] font-normal[\s\S]*text-\[var\(--text2\)\]/)
  // Default status icons via Tabler.
  assert.match(toastSource, /from "@tabler\/icons-react"/)
})

test('Alert tints by type, uses a 28 Indicator, and escalates role for danger/warning', () => {
  assert.match(alertSource, /role=\{role\}/)
  assert.match(alertSource, /type === "danger" \|\| type === "warning"\s*\?\s*"alert"\s*:\s*"status"/)
  assert.match(alertSource, /aria-live=\{role === "alert" \? "assertive" : "polite"\}/)
  // Radius md (12), pad 6/16/6/8, gap 10.
  assert.match(alertSource, /rounded-\[12px\]/)
  assert.match(alertSource, /py-1\.5/)
  assert.match(alertSource, /gap-2\.5/)
  // Tinted surfaces per type (status soft-bg tokens).
  assert.match(alertSource, /success:\s*"bg-\[var\(--green-soft\)\]"/)
  assert.match(alertSource, /danger:\s*"bg-\[var\(--red-soft\)\]"/)
  assert.match(alertSource, /warning:\s*"bg-\[var\(--amber-soft\)\]"/)
  assert.match(alertSource, /info:\s*"bg-\[var\(--blue-soft\)\]"/)
  // Small Indicator (28).
  assert.match(alertSource, /<Indicator/)
  assert.match(alertSource, /size=\{28\}/)
  // Four types.
  for (const type of ['success', 'danger', 'warning', 'info']) {
    assert.match(alertSource, new RegExp(`\\b${type}:`), `Alert exposes ${type}`)
  }
})

test('NavigationItem renders a focusable nav row with selected accent + aria-current', () => {
  // Figma metrics: h32, gap 10, Inter Medium 13.
  assert.match(navItemSource, /h-\[32px\]/)
  assert.match(navItemSource, /gap-2\.5/)
  assert.match(navItemSource, /font-medium/)
  // Default vs selected chrome.
  assert.match(navItemSource, /bg-transparent text-\[var\(--text2\)\]/)
  assert.match(navItemSource, /data-\[selected=true\]:bg-\[var\(--panel3\)\]/)
  assert.match(navItemSource, /data-\[selected=true\]:text-\[var\(--accent\)\]/)
  assert.match(navItemSource, /data-\[selected=true\]:rounded-xl/)
  // a11y: aria-current on selection, accent focus ring.
  assert.match(navItemSource, /aria-current.*selected \? \("page"/)
  assert.match(navItemSource, /focus-visible:border-\[var\(--accent\)\]/)
  // Collapsed (icon-only) + label fallback to accessible name.
  assert.match(navItemSource, /collapsed\?:\s*boolean/)
  assert.match(navItemSource, /aria-label.*collapsed \? label/)
  // Renders button by default, anchor when href is given.
  assert.match(navItemSource, /href != null/)
  assert.match(navItemSource, /<button/)
  assert.match(navItemSource, /<a\b/)
  // Trailing slot.
  assert.match(navItemSource, /trailing/)
})
