import test from 'node:test'
import assert from 'node:assert/strict'
import { alertColorSwatch, dashAlertDefaults, dashAlertFromSettings, dashAlertTypes, previewAlertBanner, type DashAlertBanner, type DashAlertPopup, type DashAlertSize } from './alerts'
import { dashSettingColors, defaultDashPalette, findPresetByAlertColorToken, presetSwatchColor } from './palette'
import type { DashAlert, DashLayout } from './index'

function assertDefined<T>(value: T | null | undefined): asserts value is T {
  assert.ok(value)
}

function alertPopup(banner: DashAlertBanner | null): DashAlertPopup {
  assert.ok(banner && banner.kind === 'alert', 'expected an alert popup')
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
  const banner = alertPopup(previewAlertBanner(layout([green]), green, defaultDashPalette))
  // "green" canonicalizes to the Viper preset, whose primary swatch is the dash green —
  // not TC's own blue, which is what tc_change would otherwise use.
  const viper = findPresetByAlertColorToken('green')
  assertDefined(viper)
  assert.equal(banner.color, presetSwatchColor(viper))
  assert.notEqual(banner.color, dashSettingColors.tc)
  const flag = alert({ type: 'flag', colorToken: 'green' })
  assert.equal(alertPopup(previewAlertBanner(layout([]), flag, defaultDashPalette)).color, defaultDashPalette.raceControlYellow, 'a signal keeps its own colour')
})

test("an alert's own displayMode wins over the layout's", () => {
  const boxed = alert({ displayMode: 'center' })
  const centered = alertPopup(previewAlertBanner(layout([boxed], { alertConfig: { displayMode: 'full' } }), boxed, defaultDashPalette))
  assert.equal(centered.displayMode, 'center')
  if (centered.displayMode === 'center') assert.deepEqual([centered.col, centered.row, centered.colSpan, centered.rowSpan, centered.gridCols], [6, 3, 8, 6, 20])
  const full = alert({ displayMode: 'full' })
  assert.equal(alertPopup(previewAlertBanner(layout([full], { alertConfig: { displayMode: 'strip' } }), full, defaultDashPalette)).displayMode, 'full')
})

test('the preview wears the same look a real alert would, for every type at either size', () => {
  const own = alert({ colorToken: 'ember', invertColors: true })
  const banner = alertPopup(previewAlertBanner(layout([own], { alertConfig: { displayMode: 'strip' } }), own, defaultDashPalette))
  assert.deepEqual([banner.title, banner.value, banner.detail, banner.displayMode, banner.invertColors], ['TC', '5', 'WAS 4 · OF 9', 'strip', true])
  const ember = findPresetByAlertColorToken('ember')
  assertDefined(ember)
  assert.equal(banner.color, presetSwatchColor(ember))

  const sizes: readonly DashAlertSize[] = ['strip', 'full']
  for (const type of dashAlertTypes) {
    for (const displayMode of sizes) {
      const preview = previewAlertBanner(layout([]), alert({ type, displayMode }), defaultDashPalette)
      assertDefined(preview)
      if (type === 'lap_summary') assert.equal(preview.kind, 'lapSummary')
      else if (type === 'dial_change') assert.deepEqual(preview.kind === 'multiDial' && preview.displayMode, displayMode)
      else assert.deepEqual([preview.kind === 'alert' && preview.alertType, preview.kind === 'alert' && preview.displayMode], [type, displayMode], type)
    }
  }
  assert.equal(previewAlertBanner(layout([]), alert({ type: 'unknown' }), defaultDashPalette), null)
})

test("every alert type has its default settings, in the contract's shape", () => {
  assert.deepEqual(dashAlertDefaults.map((settings) => settings.type), dashAlertTypes)
  const byType = new Map(dashAlertDefaults.map((settings) => [settings.type, settings]))
  assert.deepEqual(byType.get('penalty'), { type: 'penalty', enabled: true, size: 'full', invertColors: true, durationSeconds: 5, untilAck: true })
  assert.deepEqual(byType.get('fuel_low'), { type: 'fuel_low', enabled: true, size: 'strip', invertColors: false, durationSeconds: 3, untilAck: true, lapsLeft: 2 })
  assert.equal(byType.get('arb_change')?.enabled, false)
})

test('settings stamp onto a layout alert the renderer reads', () => {
  const fuel = dashAlertDefaults.find((settings) => settings.type === 'fuel_low')
  assertDefined(fuel)
  const stamped = dashAlertFromSettings(fuel)
  assert.deepEqual([stamped.id, stamped.type, stamped.displayMode, stamped.untilAck, stamped.lapsLeft], ['fuel_low', 'fuel_low', 'strip', true, 2])
  const tc = dashAlertDefaults[0]
  assertDefined(tc)
  assert.equal('lapsLeft' in dashAlertFromSettings(tc), false, 'only fuel_low carries lapsLeft')
  assert.equal(alertPopup(previewAlertBanner(layout([]), dashAlertFromSettings(tc), defaultDashPalette)).displayMode, 'full')
})

test('alert colour swatches: presets paint their swatch, yellow the warning colour, auto nothing', () => {
  assert.equal(alertColorSwatch('auto', defaultDashPalette), null)
  assert.equal(alertColorSwatch('yellow', defaultDashPalette), defaultDashPalette.warning)
  const ice = findPresetByAlertColorToken('ice')
  assertDefined(ice)
  assert.equal(alertColorSwatch('blue', defaultDashPalette), presetSwatchColor(ice), 'old spellings resolve too')
})
