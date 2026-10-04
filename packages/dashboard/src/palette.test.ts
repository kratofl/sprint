import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalAlertColorToken,
  defaultDashPalette,
  dimColor,
  effectiveColorSystem,
  findPresetByAlertColorToken,
  matchLayoutThemeName,
  matchThemeName,
  presetSwatchColor,
  resolveDashPalette,
  resolveStyleColor,
  resolveTyreColor,
} from './palette'
import type { DashTheme } from './index'

function assertDefined<T>(value: T | null | undefined): asserts value is T {
  assert.ok(value)
}

test('the default palette keeps the wheel colors the hardware output was tuned with', () => {
  assert.equal(defaultDashPalette.surface, '#1B1B1E')
  assert.equal(defaultDashPalette.warning, '#FF6A00')
  assert.equal(defaultDashPalette.danger, '#F02744')
  assert.equal(defaultDashPalette.rpmShift, '#1F7FE6')
})

test('resolveDashPalette ignores the theme entirely under the functional color system', () => {
  const theme: DashTheme = { primary: '#123456', accent: '#654321' }
  assert.deepEqual(resolveDashPalette(theme, 'functional'), defaultDashPalette)
})

test('resolveDashPalette returns the default for an empty or missing theme', () => {
  assert.deepEqual(resolveDashPalette(undefined, 'styled'), defaultDashPalette)
  assert.deepEqual(resolveDashPalette({}, 'styled'), defaultDashPalette)
})

test('resolveDashPalette applies valid hex overrides and ignores unparseable ones', () => {
  const palette = resolveDashPalette({ primary: '#112233', accent: 'not-a-color' }, 'styled')
  assert.equal(palette.primary, '#112233')
  assert.equal(palette.rpmNormal, '#112233') // rpmNormal follows primary
  assert.equal(palette.accent, defaultDashPalette.accent) // invalid hex falls back to default
})

test('resolveDashPalette pins danger/critical/fault/rpmNearLimit regardless of the theme', () => {
  const palette = resolveDashPalette({ danger: '#00FF00', critical: '#00FF00', fault: '#00FF00' }, 'styled')
  assert.equal(palette.danger, defaultDashPalette.critical)
  assert.equal(palette.critical, defaultDashPalette.critical)
  assert.equal(palette.fault, defaultDashPalette.fault)
  assert.equal(palette.rpmNearLimit, defaultDashPalette.critical)
})

test('resolveDashPalette falls back neutral to foreground, then to the default', () => {
  assert.equal(resolveDashPalette({ foreground: '#AABBCC' }, 'styled').neutral, '#AABBCC')
  assert.equal(resolveDashPalette({ primary: '#112233' }, 'styled').neutral, defaultDashPalette.neutral)
})

test('resolveStyleColor maps known tokens and treats anything else as inherit', () => {
  const palette = defaultDashPalette
  assert.equal(resolveStyleColor('ember', palette), palette.primary)
  assert.equal(resolveStyleColor('Info', palette), palette.accent)
  assert.equal(resolveStyleColor('danger', palette), palette.danger)
  assert.equal(resolveStyleColor('', palette), undefined)
  assert.equal(resolveStyleColor(undefined, palette), undefined)
  assert.equal(resolveStyleColor('not-a-token', palette), undefined)
})

test('resolveTyreColor buckets by the desktop painter thresholds', () => {
  const palette = defaultDashPalette
  assert.equal(resolveTyreColor(120, palette), palette.critical)
  assert.equal(resolveTyreColor(105, palette), palette.warning)
  assert.equal(resolveTyreColor(85, palette), palette.goodOnTarget)
  assert.equal(resolveTyreColor(40, palette), palette.coldLow)
})

test('dimColor scales RGB channels by the factor, truncating toward zero', () => {
  assert.equal(dimColor('#64C8FF', 0.5), '#32647f') // 255 * 0.5 = 127.5, truncated to 127 (0x7f)
  assert.equal(dimColor('#010101', 0.5), '#000000')
})

test('dimColor preserves an explicit alpha channel (AARRGGBB)', () => {
  assert.equal(dimColor('#8064C8FF', 0.5), '#8032647f')
})

test('canonicalAlertColorToken maps shorthand tokens to their preset name', () => {
  assert.equal(canonicalAlertColorToken('blue'), 'ice')
  assert.equal(canonicalAlertColorToken('PRIMARY'), 'ember')
  assert.equal(canonicalAlertColorToken('auto'), 'auto')
  assert.equal(canonicalAlertColorToken(undefined), '')
})

test('findPresetByAlertColorToken resolves shorthand and canonical tokens, and misses unknown ones', () => {
  assert.equal(findPresetByAlertColorToken('green')?.name, 'Viper')
  assert.equal(findPresetByAlertColorToken('crimson')?.name, 'Crimson')
  assert.equal(findPresetByAlertColorToken('not-a-preset'), undefined)
})

test('presetSwatchColor falls back to the default foreground for the themeless preset', () => {
  const graphite = findPresetByAlertColorToken('auto')
  assertDefined(graphite)
  assert.equal(presetSwatchColor(graphite), defaultDashPalette.foreground)
})

test('matchThemeName recognizes an exact preset and returns null for a custom theme', () => {
  assert.equal(matchThemeName({}), 'Graphite')
  assert.equal(matchThemeName({ primary: '#16B566', accent: '#FF6A00' }), 'Viper')
  assert.equal(matchThemeName({ primary: '#123456' }), null)
})

test('effectiveColorSystem defaults to styled only when a theme override is actually set', () => {
  assert.equal(effectiveColorSystem({ colorSystem: undefined, theme: undefined }), 'functional')
  assert.equal(effectiveColorSystem({ colorSystem: undefined, theme: { primary: '#112233' } }), 'styled')
  assert.equal(effectiveColorSystem({ colorSystem: 'functional', theme: { primary: '#112233' } }), 'functional')
})

test('matchLayoutThemeName reports Graphite for functional layouts without inspecting the theme', () => {
  assert.equal(matchLayoutThemeName({ colorSystem: 'functional', theme: { primary: '#123456' } }), 'Graphite')
  assert.equal(matchLayoutThemeName({ colorSystem: 'styled', theme: {} }), 'Graphite')
})
