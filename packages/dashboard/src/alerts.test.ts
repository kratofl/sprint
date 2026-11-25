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
  const banner = alertPopup(previewAlertBanner(layout([green]), green, defaultDashPalette, 'Metric'))
  // "green" canonicalizes to the Viper preset, whose primary swatch is the dash green —
  // not TC's own blue, which is what tc_change would otherwise use.
  const viper = findPresetByAlertColorToken('green')
  assertDefined(viper)
  assert.equal(banner.color, presetSwatchColor(viper))
  assert.notEqual(banner.color, dashSettingColors.tc)
  const flag = alert({ type: 'flag', colorToken: 'green' })
  assert.equal(alertPopup(previewAlertBanner(layout([]), flag, defaultDashPalette, 'Metric')).color, defaultDashPalette.raceControlYellow, 'a signal keeps its own colour')
})

test('an alert shows full screen unless it picks its own display mode', () => {
  const boxed = alert({ displayMode: 'center' })
  const centered = alertPopup(previewAlertBanner(layout([boxed]), boxed, defaultDashPalette, 'Metric'))
  assert.equal(centered.displayMode, 'center')
  if (centered.displayMode === 'center') assert.deepEqual([centered.col, centered.row, centered.colSpan, centered.rowSpan, centered.gridCols], [6, 3, 8, 6, 20])
  const plain = alert()
  assert.equal(alertPopup(previewAlertBanner(layout([plain]), plain, defaultDashPalette, 'Metric')).displayMode, 'full')
})

test('the preview wears the same look a real alert would, for every type at either size', () => {
  const own = alert({ colorToken: 'ember', invertColors: true, displayMode: 'strip' })
  const banner = alertPopup(previewAlertBanner(layout([own]), own, defaultDashPalette, 'Metric'))
  assert.deepEqual([banner.title, banner.value, banner.detail, banner.displayMode, banner.invertColors], ['TC', '5', 'WAS 4', 'strip', true], 'never the maximum')
  const ember = findPresetByAlertColorToken('ember')
  assertDefined(ember)
  assert.equal(banner.color, presetSwatchColor(ember))

  const sizes: readonly DashAlertSize[] = ['strip', 'full']
  for (const type of dashAlertTypes.filter((candidate) => candidate !== 'pit_limiter')) {
    for (const displayMode of sizes) {
      const preview = previewAlertBanner(layout([]), alert({ type, displayMode }), defaultDashPalette, 'Metric')
      assertDefined(preview)
      if (type === 'lap_summary') assert.equal(preview.kind, 'lapSummary')
      else if (type === 'dial_change') assert.deepEqual(preview.kind === 'multiDial' && preview.displayMode, displayMode)
      else assert.deepEqual([preview.kind === 'alert' && preview.alertType, preview.kind === 'alert' && preview.displayMode], [type, displayMode], type)
    }
  }
  assert.equal(previewAlertBanner(layout([]), alert({ type: 'unknown' }), defaultDashPalette, 'Metric'), null)
  assert.equal(previewAlertBanner(layout([]), alert({ type: 'pit_limiter' }), defaultDashPalette, 'Metric'), null, 'an overlay, not a popup')
})

test("the engine warning's preview shows its temperatures in the driver's units, as alerts.rs does", () => {
  const engine = alert({ type: 'engine_warning' })
  assert.equal(alertPopup(previewAlertBanner(layout([]), engine, defaultDashPalette, 'Metric')).detail, 'WATER 118° · OIL 142°')
  assert.equal(alertPopup(previewAlertBanner(layout([]), engine, defaultDashPalette, 'Imperial')).detail, 'WATER 244° · OIL 288°')
})

test("every alert type has its default settings, in the contract's shape", () => {
  assert.deepEqual(dashAlertDefaults.map((settings) => settings.type), dashAlertTypes)
  const byType = new Map(dashAlertDefaults.map((settings) => [settings.type, settings]))
  assert.deepEqual(byType.get('penalty'), { type: 'penalty', enabled: true, size: 'full', invertColors: true, durationSeconds: 5, untilAck: true })
  assert.deepEqual(byType.get('fuel_low'), { type: 'fuel_low', enabled: true, size: 'strip', invertColors: false, durationSeconds: 3, untilAck: true, lapsLeft: 2, warningLapsLeft: 4 })
  assert.deepEqual(byType.get('launch'), {
    type: 'launch', enabled: true, size: 'strip', invertColors: false, durationSeconds: 5, untilAck: true,
    clutchPercent: 50, speedKmh: 10, rpmFrom: 5000, rpmTo: 6000, throttleFrom: 20, throttleTo: 30,
  })
  assert.deepEqual(byType.get('lift_now'), { type: 'lift_now', enabled: true, size: 'strip', invertColors: false, durationSeconds: 2, untilAck: true, liftPoint: 220 })
  assert.deepEqual(byType.get('pit_now'), { type: 'pit_now', enabled: true, size: 'strip', invertColors: false, durationSeconds: 5, untilAck: true })
  assert.deepEqual(byType.get('engine_warning'), { type: 'engine_warning', enabled: true, size: 'full', invertColors: true, durationSeconds: 5, untilAck: true, waterLimitCelsius: 110, oilLimitCelsius: 130 })
  assert.equal(byType.get('arb_change')?.enabled, false)
})

test('settings stamp onto a layout alert the renderer reads', () => {
  const fuel = dashAlertDefaults.find((settings) => settings.type === 'fuel_low')
  assertDefined(fuel)
  const stamped = dashAlertFromSettings(fuel)
  assert.deepEqual([stamped.id, stamped.type, stamped.displayMode, stamped.untilAck, stamped.lapsLeft, stamped.warningLapsLeft], ['fuel_low', 'fuel_low', 'strip', true, 2, 4])
  const tc = dashAlertDefaults[0]
  assertDefined(tc)
  assert.equal('lapsLeft' in dashAlertFromSettings(tc), false, 'only fuel_low carries lapsLeft')
  const engine = dashAlertDefaults.find((settings) => settings.type === 'engine_warning')
  assertDefined(engine)
  const limits = dashAlertFromSettings(engine)
  assert.deepEqual([limits.waterLimitCelsius, limits.oilLimitCelsius], [110, 130], 'the engine limits travel on engine_warning')
  assert.equal('waterLimitCelsius' in dashAlertFromSettings(tc), false)
  const launch = dashAlertDefaults.find((settings) => settings.type === 'launch')
  assertDefined(launch)
  const window = dashAlertFromSettings(launch)
  assert.deepEqual([window.clutchPercent, window.speedKmh, window.rpmFrom, window.rpmTo, window.throttleFrom, window.throttleTo], [50, 10, 5000, 6000, 20, 30])
  const lift = dashAlertDefaults.find((settings) => settings.type === 'lift_now')
  assertDefined(lift)
  assert.equal(dashAlertFromSettings(lift).liftPoint, 220)
  assert.equal(alertPopup(previewAlertBanner(layout([]), dashAlertFromSettings(tc), defaultDashPalette, 'Metric')).displayMode, 'full')
})

test('alert colour swatches: presets paint their swatch, yellow the warning colour, auto nothing', () => {
  assert.equal(alertColorSwatch('auto', defaultDashPalette), null)
  assert.equal(alertColorSwatch('yellow', defaultDashPalette), defaultDashPalette.warning)
  const ice = findPresetByAlertColorToken('ice')
  assertDefined(ice)
  assert.equal(alertColorSwatch('blue', defaultDashPalette), presetSwatchColor(ice), 'old spellings resolve too')
})
