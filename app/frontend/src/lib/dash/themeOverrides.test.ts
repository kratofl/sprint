import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearDomainColorOverride,
  clearThemeColorOverride,
  migrateLegacyDashThemeOverrides,
  normalizeDomainPaletteOverrides,
  normalizeThemeOverrides,
  resolveDashTheme,
  resolveDomainPalette,
  setDomainColorOverride,
  setThemeColorOverride,
} from './themeOverrides.ts'
import { DEFAULT_DASH_THEME, DEFAULT_DOMAIN_PALETTE } from './defaults.ts'

const customColor = { R: 1, G: 2, B: 3, A: 255 }
const otherColor = { R: 9, G: 8, B: 7, A: 255 }
const legacyDefaultTheme = {
  primary: { R: 255, G: 144, B: 108, A: 255 },
  accent: { R: 90, G: 248, B: 251, A: 255 },
  fg: { R: 255, G: 255, B: 255, A: 255 },
  muted: { R: 128, G: 128, B: 128, A: 255 },
  muted2: { R: 161, G: 161, B: 170, A: 255 },
  success: { R: 52, G: 211, B: 153, A: 255 },
  warning: { R: 251, G: 191, B: 36, A: 255 },
  danger: { R: 248, G: 113, B: 113, A: 255 },
  surface: { R: 20, G: 20, B: 20, A: 255 },
  bg: { R: 10, G: 10, B: 10, A: 255 },
  border: { R: 42, G: 42, B: 42, A: 255 },
  rpmRed: { R: 248, G: 113, B: 113, A: 255 },
}

test('resolveDashTheme merges built-ins, globals, and layout overrides in order', () => {
  const resolved = resolveDashTheme(
    { accent: customColor, bg: otherColor },
    { accent: otherColor },
  )

  assert.deepEqual(resolved.primary, DEFAULT_DASH_THEME.primary)
  assert.deepEqual(resolved.bg, otherColor)
  assert.deepEqual(resolved.accent, otherColor)
})

test('resolveDomainPalette merges built-ins, globals, and layout overrides in order', () => {
  const resolved = resolveDomainPalette(
    { tc: customColor, motor: otherColor },
    { tc: otherColor },
  )

  assert.deepEqual(resolved.abs, DEFAULT_DOMAIN_PALETTE.abs)
  assert.deepEqual(resolved.motor, otherColor)
  assert.deepEqual(resolved.tc, otherColor)
})

test('theme override helpers keep sparse objects and clear the final token back to inherit', () => {
  const set = setThemeColorOverride(undefined, 'accent', customColor)
  assert.deepEqual(set, { accent: customColor })

  const cleared = clearThemeColorOverride(set, 'accent')
  assert.equal(cleared, undefined)
  assert.equal(normalizeThemeOverrides({}), undefined)
})

test('domain override helpers keep sparse objects and clear the final token back to inherit', () => {
  const set = setDomainColorOverride(undefined, 'tc', customColor)
  assert.deepEqual(set, { tc: customColor })

  const cleared = clearDomainColorOverride(set, 'tc')
  assert.equal(cleared, undefined)
  assert.equal(normalizeDomainPaletteOverrides({}), undefined)
})

test('migrates explicit legacy dash defaults to the flat Figma defaults', () => {
  const migrated = migrateLegacyDashThemeOverrides(legacyDefaultTheme)

  assert.ok(migrated)
  assert.deepEqual(migrated, DEFAULT_DASH_THEME)
})

test('keeps non-default custom dash theme colors during migration', () => {
  const migrated = migrateLegacyDashThemeOverrides({
    ...legacyDefaultTheme,
    primary: customColor,
    bg: otherColor,
  })

  assert.ok(migrated)
  assert.deepEqual(migrated.primary, customColor)
  assert.deepEqual(migrated.bg, otherColor)
  assert.deepEqual(migrated.accent, DEFAULT_DASH_THEME.accent)
})
