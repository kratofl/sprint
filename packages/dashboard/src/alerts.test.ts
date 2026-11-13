import test from 'node:test'
import assert from 'node:assert/strict'
import { alertColorSwatch, previewAlertBanner, type DashAlertBanner, type DashSettingPopup } from './alerts'
import { dashSettingColors, defaultDashPalette, findPresetByAlertColorToken, presetSwatchColor } from './palette'
import type { DashAlert, DashLayout } from './index'

function assertDefined<T>(value: T | null | undefined): asserts value is T {
  assert.ok(value)
}

function settingPopup(banner: DashAlertBanner | null): DashSettingPopup {
  assert.ok(banner && banner.kind === 'setting', 'expected a setting popup')
  return banner
}

function alert(overrides: Partial<DashAlert> = {}): DashAlert {
  return { id: 'a1', type: 'tc_change', enabled: true, col: 6, row: 3, colSpan: 8, rowSpan: 6, ...overrides }
}

function layout(alerts: DashAlert[], overrides: Partial<DashLayout> = {}): DashLayout {
  return { id: 'l1', name: 'Layout', mode: 'basic', gridCols: 20, gridRows: 12, pages: [], alerts, ...overrides }
}

test("a named color token resolves to that theme preset's swatch, overriding the setting's own color", () => {
  const green = alert({ colorToken: 'green' })
  const banner = settingPopup(previewAlertBanner(layout([green]), green, defaultDashPalette))
  // "green" canonicalizes to the Viper preset, whose primary swatch is the dash green —
  // not TC's own blue, which is what tc_change would otherwise use.
  const viper = findPresetByAlertColorToken('green')
  assertDefined(viper)
  assert.equal(banner.color, presetSwatchColor(viper))
  assert.notEqual(banner.color, dashSettingColors.tc)
})

test("an alert's own displayMode wins over the layout's", () => {
  const boxed = alert({ displayMode: 'center' })
  assert.equal(settingPopup(previewAlertBanner(layout([boxed], { alertConfig: { displayMode: 'full' } }), boxed, defaultDashPalette)).fullScreen, false)
  const full = alert({ displayMode: 'full' })
  assert.equal(settingPopup(previewAlertBanner(layout([full], { alertConfig: { displayMode: 'center' } }), full, defaultDashPalette)).fullScreen, true)
})

test('the designer preview wears the same look a real change would', () => {
  const own = alert({ colorToken: 'ember', invertColors: true })
  const banner = settingPopup(previewAlertBanner(layout([own], { alertConfig: { displayMode: 'center' } }), own, defaultDashPalette))
  assert.equal(banner.title, 'TC')
  assert.equal(banner.fullScreen, false, "the layout's display mode when the alert has none")
  assert.equal(banner.invertColors, true)
  const ember = findPresetByAlertColorToken('ember')
  assertDefined(ember)
  assert.equal(banner.color, presetSwatchColor(ember))
  assert.equal(previewAlertBanner(layout([]), alert({ type: 'lap_summary' }), defaultDashPalette)?.kind, 'lapSummary')
  assert.equal(previewAlertBanner(layout([]), alert({ type: 'unknown' }), defaultDashPalette), null)
})

test('alert colour swatches: presets paint their swatch, yellow the warning colour, auto nothing', () => {
  assert.equal(alertColorSwatch('auto', defaultDashPalette), null)
  assert.equal(alertColorSwatch('yellow', defaultDashPalette), defaultDashPalette.warning)
  const ice = findPresetByAlertColorToken('ice')
  assertDefined(ice)
  assert.equal(alertColorSwatch('blue', defaultDashPalette), presetSwatchColor(ice), 'old spellings resolve too')
})
