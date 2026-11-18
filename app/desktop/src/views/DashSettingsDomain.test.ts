import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dashAlertDefaults, dashAlertTypes, type DashAlertSettings, type DashLayout } from '@sprint/dashboard'
import { ALERT_GROUPS, ackRows, alertSummary, buildAlertUpdate, durationAtStep, durationStep, durationStepText, previewDash, stampDashAlerts, stepLapsLeft } from './DashSettingsDomain'
import { parseDevice, type Device } from './DevicesDomain'

const device = (fields: Record<string, unknown>): Device => {
  const parsed = parseDevice({ width: 800, height: 480, ...fields })
  assert.ok(parsed)
  return parsed
}

const dash = (id: string, fields: Partial<DashLayout> = {}): DashLayout => ({ id, name: id, mode: 'basic', gridCols: 20, gridRows: 12, pages: [], alerts: [], ...fields })

const settings = (type: DashAlertSettings['type']): DashAlertSettings => {
  const found = dashAlertDefaults.find((alert) => alert.type === type)
  assert.ok(found)
  return found
}

test('every alert type is listed once on the page', () => {
  const listed = ALERT_GROUPS.flatMap((group) => group.types)
  assert.deepEqual([...listed].sort(), [...dashAlertTypes].sort())
})

test('an alert row sums up its look in a line', () => {
  assert.equal(alertSummary(settings('tc_change')), 'Full screen · 2 s')
  assert.equal(alertSummary(settings('penalty')), 'Full screen · Until Ack · Inverted')
  assert.equal(alertSummary(settings('arb_change')), 'Off')
  assert.equal(alertSummary(settings('fuel_low')), '2 laps left · Strip · Until Ack')
  // The lap review has no size or colours of its own.
  assert.equal(alertSummary({ ...settings('lap_summary'), invertColors: true }), '5 s')
})

test("the duration slider's last step is Until Ack, which keeps the seconds", () => {
  const tc = settings('tc_change')
  assert.equal(durationStep(tc), 2)
  assert.equal(durationStep({ ...tc, untilAck: true }), 31)
  assert.deepEqual(durationAtStep('tc_change', 30), { untilAck: false, durationSeconds: 30 })
  assert.deepEqual(durationAtStep('tc_change', 31), { untilAck: true })
  assert.equal(durationStepText('tc_change', 31), 'Until Ack')
  // The lap review stops at 15 s.
  assert.equal(durationStep({ ...settings('lap_summary'), untilAck: true }), 16)
  assert.equal(durationStepText('lap_summary', 15), '15 s')
  assert.deepEqual(buildAlertUpdate('tc_change', durationAtStep('tc_change', 31)), { type: 'dashAlerts.update', alertType: 'tc_change', untilAck: true })
})

test('the fuel warning mark steps within 1 to 9 laps', () => {
  assert.equal(stepLapsLeft(2, 1), 3)
  assert.equal(stepLapsLeft(1, -1), null)
  assert.equal(stepLapsLeft(9, 1), null)
})

test('the preview plays on the first dash device’s dash at its screen size, else on the first dash', () => {
  const layouts = [dash('first', { screenProfile: 'square-800x800' }), dash('wheel')]
  const devices = [
    device({ id: 'flags', name: 'Flags', type: 'screen', driver: 'usbd480', purpose: 'flags', dashId: 'first' }),
    device({ id: 'omega', name: 'Omega', type: 'wheel', driver: 'vocore', width: 480, height: 800, rotation: 90, purpose: 'dash', dashId: 'wheel' }),
  ]
  assert.deepEqual(previewDash(devices, layouts), { layout: layouts[1], size: { width: 800, height: 480 }, deviceName: 'Omega' })
  assert.deepEqual(previewDash([], layouts), { layout: layouts[0], size: { width: 800, height: 800 }, deviceName: null })
  assert.equal(previewDash(devices, []), null)
})

test('Acknowledge lists each device with buttons that offers it, with its button and whether it is waiting; a plain screen is left out', () => {
  const devices = [
    device({ id: 'omega', name: 'Omega', type: 'wheel', bindings: [{ input: 'button:7', command: 'acknowledge' }] }),
    device({ id: 'box', name: 'Button box', type: 'buttonbox' }),
    device({ id: 'screen', name: 'Screen', type: 'screen' }),
  ]
  const ack = { id: 'acknowledge', label: 'Acknowledge' }
  const rows = ackRows(devices, { functions: { omega: [ack], box: [ack], screen: [ack] }, listening: { deviceId: 'box', command: 'acknowledge' } })
  assert.deepEqual(rows, [
    { deviceId: 'omega', name: 'Omega', input: 'button:7', waiting: false },
    { deviceId: 'box', name: 'Button box', input: null, waiting: true },
  ])
})

test('a stamped dash carries the app-wide alerts and none of its own look, and the dash itself is untouched', () => {
  const own = dash('d', { alerts: [{ id: 'old', type: 'tc_change', enabled: false, col: 1, row: 1, colSpan: 4, rowSpan: 4 }], alertConfig: { displayMode: 'center' } })
  const stamped = stampDashAlerts(own, dashAlertDefaults)
  assert.equal(stamped.alerts.length, dashAlertTypes.length)
  assert.deepEqual(stamped.alerts[0], { id: 'tc_change', type: 'tc_change', enabled: true, col: 0, row: 0, colSpan: 1, rowSpan: 1, displayMode: 'full', invertColors: false, durationSeconds: 2, untilAck: false })
  assert.equal(stamped.alertConfig, undefined)
  assert.equal(own.alerts[0]?.id, 'old')
})
