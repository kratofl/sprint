import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// macos.css is an overlay on desktop.css (both are bundled; <html data-platform="mac"> picks
// it). A token desktop.css defines but macos.css forgets would silently show the brand value on
// a Mac, so the two files must name the same custom properties. The brand and status scales are
// shared across platforms and live in desktop.css only.
const read = (file: string): string =>
  readFileSync(new URL(`../../../packages/tokens/${file}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Custom property names per rule, keyed by the rule's selector (innermost blocks only). */
const blocks = (css: string): Map<string, Set<string>> => {
  const result = new Map<string, Set<string>>()
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? '').replace(/\s+/g, ' ').trim()
    const names = new Set([...(match[2] ?? '').matchAll(/(--[a-z0-9-]+)\s*:/g)].map((name) => name[1] ?? ''))
    const existing = result.get(selector) ?? new Set<string>()
    for (const name of names) existing.add(name)
    result.set(selector, existing)
  }
  return result
}

const allNames = (map: Map<string, Set<string>>): Set<string> => new Set([...map.values()].flatMap((names) => [...names]))
const sharedScale = /^--(brand|green|red|yellow|blue|purple)-\d+$/

const desktop = blocks(read('desktop.css'))
const mac = blocks(read('macos.css'))
const sorted = (names: Iterable<string>): string[] => [...names].sort()

test('macos.css redefines every desktop.css token except the shared brand/status scales, and adds none of its own', () => {
  const expected = sorted([...allNames(desktop)].filter((name) => !sharedScale.test(name)))
  assert.deepEqual(sorted(allNames(mac)), expected)
})

test('both macOS dark blocks (forced and OS-following) define the same tokens, covering every desktop dark token', () => {
  const forced = mac.get(':root[data-platform="mac"][data-theme="dark"]')
  const followsOs = mac.get(':root[data-platform="mac"]:not([data-theme="light"])')
  const desktopDark = desktop.get('[data-theme="dark"]')
  assert.ok(forced && followsOs && desktopDark)
  assert.deepEqual(sorted(followsOs), sorted(forced))
  for (const name of desktopDark) assert.ok(forced.has(name), `${name} missing from the macOS dark theme`)
})
