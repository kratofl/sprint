import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_DASH_THEME, DEFAULT_DOMAIN_PALETTE } from '../lib/dash/defaults.ts'
import { getDomainColorRowState, getThemeColorRowState } from './additionalSettingsPanelState.ts'

const customColor = { R: 1, G: 2, B: 3, A: 255 }

test('dash theme rows treat explicit local overrides as overrides even when the color matches global', () => {
  const state = getThemeColorRowState({
    key: 'accent',
    theme: { accent: DEFAULT_DASH_THEME.accent },
    inheritedTheme: DEFAULT_DASH_THEME,
    hardcodedTheme: DEFAULT_DASH_THEME,
    inheritsGlobalColors: true,
  })

  assert.deepEqual(state.value, DEFAULT_DASH_THEME.accent)
  assert.equal(state.isOverridden, true)
})

test('dash theme rows inherit global colors when no local override exists', () => {
  const inheritedTheme = { ...DEFAULT_DASH_THEME, accent: customColor }
  const state = getThemeColorRowState({
    key: 'accent',
    theme: {},
    inheritedTheme,
    hardcodedTheme: DEFAULT_DASH_THEME,
    inheritsGlobalColors: true,
  })

  assert.deepEqual(state.value, customColor)
  assert.equal(state.isOverridden, false)
})

test('global theme rows only mark colors as overridden when they differ from hardcoded defaults', () => {
  const defaultState = getThemeColorRowState({
    key: 'accent',
    theme: DEFAULT_DASH_THEME,
    inheritedTheme: DEFAULT_DASH_THEME,
    hardcodedTheme: DEFAULT_DASH_THEME,
    inheritsGlobalColors: false,
  })
  const customState = getThemeColorRowState({
    key: 'accent',
    theme: { ...DEFAULT_DASH_THEME, accent: customColor },
    inheritedTheme: DEFAULT_DASH_THEME,
    hardcodedTheme: DEFAULT_DASH_THEME,
    inheritsGlobalColors: false,
  })

  assert.equal(defaultState.isOverridden, false)
  assert.equal(customState.isOverridden, true)
})

test('dash domain rows distinguish inherited and explicit overrides', () => {
  const inheritedState = getDomainColorRowState({
    key: 'tc',
    domainPalette: {},
    inheritedDomain: { ...DEFAULT_DOMAIN_PALETTE, tc: customColor },
    hardcodedDomain: DEFAULT_DOMAIN_PALETTE,
    inheritsGlobalColors: true,
  })
  const overriddenState = getDomainColorRowState({
    key: 'tc',
    domainPalette: { tc: DEFAULT_DOMAIN_PALETTE.tc },
    inheritedDomain: DEFAULT_DOMAIN_PALETTE,
    hardcodedDomain: DEFAULT_DOMAIN_PALETTE,
    inheritsGlobalColors: true,
  })

  assert.deepEqual(inheritedState?.value, customColor)
  assert.equal(inheritedState?.isOverridden, false)
  assert.equal(overriddenState?.isOverridden, true)
})
