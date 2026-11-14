import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  NO_CATALOG_FILTER,
  browserDisplayAddress,
  catalogBrands,
  catalogLine,
  commandErrorMessage,
  describeDeviceStatus,
  deviceImageKey,
  deviceSummary,
  foundEntries,
  matchesCatalogFilter,
  matchesDevicesFilter,
  ownWheelMatchesFilter,
  parseCatalog,
  parseDevice,
  parseScreen,
  purposesFor,
  screenSettings,
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

const browserDisplay = (fields: Record<string, unknown> = {}): Device =>
  device({ presetId: 'browser-display', name: 'Browser / VR display', type: 'screen', driver: 'browser', width: 1024, height: 576, rotation: 90, ...fields })

const browserScreen = (state: string, viewers: number | null, detail?: string): ScreenOutput => {
  const parsed = parseScreen({ deviceId: 'd1', hardware: { status: { state, detail, isConnected: state === 'Connected' }, performance: {}, viewers } })
  assert.ok(parsed)
  return parsed
}

test('a browser display says whether a page shows it, and its own fault, in its own words', () => {
  const display = browserDisplay()
  assert.deepEqual(describeDeviceStatus(display, browserScreen('Connected', 2)), { label: 'Showing', detail: '2 pages showing this display now.', tone: 'success' })
  assert.equal(describeDeviceStatus(display, browserScreen('Connected', 1)).detail, '1 page showing this display now.')
  assert.equal(describeDeviceStatus(display, browserScreen('WaitingForViewer', 0)).label, 'Waiting for a viewer')
  const fault = describeDeviceStatus(display, browserScreen('Faulted', 0, 'Port 28780 is in use by another program.'))
  assert.deepEqual(fault, { label: "Can't serve it", detail: 'Port 28780 is in use by another program.', tone: 'danger' })
  assert.equal(describeDeviceStatus({ ...display, disabled: true }, undefined).label, 'Off')

  // Waiting for a viewer is normal (the VR tool is not running), not something to fix.
  assert.equal(matchesDevicesFilter('attention', display, browserScreen('WaitingForViewer', 0)), false)
  assert.equal(matchesDevicesFilter('attention', display, browserScreen('Faulted', 0, 'Port 28780 is in use.')), true)
  assert.equal(matchesDevicesFilter('connected', display, browserScreen('Connected', 1)), true)
})

test('a browser display shows its address and picture settings, never a panel’s mounting', () => {
  const display = browserDisplay()
  assert.deepEqual(screenSettings(display), ['address', 'resolution', 'background'])
  assert.deepEqual(screenSettings(device({ type: 'screen', driver: 'vocore' })), ['frameRate', 'orientation', 'offset', 'margin'])
  assert.equal(purposesFor(display).some((purpose) => purpose.id === 'rear-view-mirror'), false)
  assert.equal(purposesFor(device({ driver: 'vocore' })).some((purpose) => purpose.id === 'rear-view-mirror'), true)
  assert.equal(browserDisplayAddress('browser-0000-0000-sim-001'), 'http://127.0.0.1:28780/dash/browser-0000-0000-sim-001')
  assert.equal(deviceSummary(browserDisplay({ width: 600, height: 900, rotation: 0 })), 'Browser · 600 × 900')
  assert.equal(deviceImageKey(display, catalog), 'browser-display')
  const [entry] = parseCatalog([{ id: 'browser-display', name: 'Browser / VR display', type: 'screen', driver: 'browser', width: 1024, height: 576 }])
  assert.ok(entry)
  assert.equal(catalogLine(entry), 'In a browser or VR overlay')
  assert.equal(display.transparent, false)
  assert.equal(browserDisplay({ transparent: true }).transparent, true)
})

test('found devices keep one entry per device plugged in and drop ids the catalog does not know', () => {
  assert.deepEqual(
    foundEntries(['generic-vocore', 'gone', 'generic-vocore'], catalog).map((entry) => entry.id),
    ['generic-vocore', 'generic-vocore'],
  )
})
