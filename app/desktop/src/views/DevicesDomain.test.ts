import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  NO_CATALOG_FILTER,
  catalogBrands,
  catalogLine,
  commandErrorMessage,
  deviceImageKey,
  foundEntries,
  matchesCatalogFilter,
  matchesDevicesFilter,
  ownWheelMatchesFilter,
  parseCatalog,
  parseDevice,
  parseScreen,
} from './DevicesDomain'
import type { Device, ScreenOutput } from './DevicesDomain'

test('a refused command shows the host reason, also with the prefix Electron adds crossing IPC', () => {
  const body = '{"error":"That is not a Sprint link code."}'
  assert.equal(commandErrorMessage(new Error(`Runtime 400: ${body}`), 'fallback'), 'That is not a Sprint link code.')
  assert.equal(
    commandErrorMessage(new Error(`Error invoking remote method 'sprint:send-command': Error: Runtime 400: ${body}`), 'fallback'),
    'That is not a Sprint link code.',
  )
})

const VOCORE_USB = { vid: 51314, pid: 4100 }

const catalog = parseCatalog([
  { id: 'bavarian-omega-v2-pro', name: 'BavarianSimTec Omega PRO V2', brand: 'BavarianSimTec', type: 'wheel', driver: 'vocore', ...VOCORE_USB, width: 480, height: 800 },
  { id: 'generic-vocore', name: 'Generic VoCore Screen', brand: 'VoCore', type: 'screen', driver: 'vocore', vid: 0, pid: 0 },
])

const device = (fields: Record<string, unknown>): Device => {
  const parsed = parseDevice({ id: 'd1', width: 800, height: 480, ...fields })
  assert.ok(parsed)
  return parsed
}

test('a device shows its preset picture, never one borrowed through a shared USB id', () => {
  assert.equal(deviceImageKey(device({ presetId: 'bavarian-omega-v2-pro', name: 'My wheel', type: 'wheel', driver: 'vocore' }), catalog), 'bavarian-omega-v2-pro')
  // A custom wheel with a VoCore panel reports the Omega's VID/PID but is not an Omega.
  assert.equal(deviceImageKey(device({ presetId: 'my-rig', name: 'My rig', type: 'wheel', driver: 'vocore', ...VOCORE_USB }), catalog), 'generic-wheel')
  assert.equal(deviceImageKey(device({ presetId: 'generic-vocore', name: 'Dash', type: 'screen', driver: 'vocore', ...VOCORE_USB }), catalog), 'generic-vocore')
  assert.equal(deviceImageKey(device({ name: 'USBD480 NX50', type: 'screen', driver: 'usbd480' }), catalog), 'generic-usbd480')
})

test('a device saved before presetId existed keeps its preset picture while it keeps the preset name', () => {
  const legacy = { type: 'wheel', driver: 'vocore', ...VOCORE_USB }
  assert.equal(deviceImageKey(device({ ...legacy, name: 'BavarianSimTec Omega PRO V2' }), catalog), 'bavarian-omega-v2-pro')
  assert.equal(deviceImageKey(device({ ...legacy, name: 'Renamed' }), catalog), 'generic-wheel')
})

const screenIn = (state: string): ScreenOutput => {
  const parsed = parseScreen({ deviceId: 'd1', hardware: { status: { state, isConnected: state === 'Connected' }, performance: {} } })
  assert.ok(parsed)
  return parsed
}

test('only a screen that should work and does not needs attention', () => {
  const screen = device({ type: 'screen', driver: 'usbd480' })
  assert.equal(matchesDevicesFilter('attention', screen, screenIn('Disconnected')), true)
  assert.equal(matchesDevicesFilter('attention', screen, screenIn('DeviceBusy')), true)
  assert.equal(matchesDevicesFilter('attention', screen, screenIn('Connected')), false)
  assert.equal(matchesDevicesFilter('attention', { ...screen, disabled: true }, screenIn('Disconnected')), false, 'turned off on purpose')
  assert.equal(matchesDevicesFilter('attention', device({ type: 'wheel', driver: '', width: 0, height: 0 }), undefined), false, 'buttons only')
  assert.equal(matchesDevicesFilter('connected', screen, screenIn('Connected')), true)
  assert.equal(matchesDevicesFilter('connected', { ...screen, disabled: true }, screenIn('Connected')), false)
})

test('the add dialog narrows by kind, brand and search together, and hides your own wheel behind a brand', () => {
  const names = (filter: typeof NO_CATALOG_FILTER) => catalog.filter((entry) => matchesCatalogFilter(filter, entry)).map((entry) => entry.id)
  assert.deepEqual(catalogBrands(catalog), ['BavarianSimTec', 'VoCore'])
  assert.deepEqual(names({ ...NO_CATALOG_FILTER, kind: 'screen' }), ['generic-vocore'])
  assert.deepEqual(names({ ...NO_CATALOG_FILTER, brand: 'BavarianSimTec' }), ['bavarian-omega-v2-pro'])
  assert.deepEqual(names({ ...NO_CATALOG_FILTER, query: ' vocore ' }), ['generic-vocore'])
  assert.deepEqual(names({ ...NO_CATALOG_FILTER, kind: 'screen', brand: 'BavarianSimTec' }), [])
  assert.equal(ownWheelMatchesFilter(NO_CATALOG_FILTER), true)
  assert.equal(ownWheelMatchesFilter({ ...NO_CATALOG_FILTER, query: 'custom' }), true)
  assert.equal(ownWheelMatchesFilter({ ...NO_CATALOG_FILTER, brand: 'VoCore' }), false)
  assert.equal(ownWheelMatchesFilter({ ...NO_CATALOG_FILTER, kind: 'screen' }), false)
})

test('a catalog card says what the hardware is, not the panel size the wheel turns', () => {
  const [omega, vocore] = catalog
  assert.ok(omega && vocore)
  assert.equal(catalogLine(omega), 'VoCore screen · buttons')
  assert.equal(catalogLine(vocore), 'Any size, read when it connects')
})

test('found devices keep one entry per device plugged in and drop ids the catalog does not know', () => {
  assert.deepEqual(
    foundEntries(['generic-vocore', 'gone', 'generic-vocore'], catalog).map((entry) => entry.id),
    ['generic-vocore', 'generic-vocore'],
  )
})
