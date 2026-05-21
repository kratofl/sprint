import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearDomainColorOverride,
  clearThemeColorOverride,
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
