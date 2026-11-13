import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_LAP_LAYOUT, addChart, moveChart, parseLapLayout, removeChart, storedLapLayout, toggleChart } from './AnalysisLapLayout'

test('a removed chart comes back at the end, and a tick takes a chart on or off', () => {
  const removed = removeChart(DEFAULT_LAP_LAYOUT, 'speed')
  assert.deepEqual(removed.charts, ['pedals', 'steering', 'gear', 'settings'])
  assert.deepEqual(addChart(removed, 'speed').charts, ['pedals', 'steering', 'gear', 'settings', 'speed'])
  assert.equal(addChart(DEFAULT_LAP_LAYOUT, 'speed'), DEFAULT_LAP_LAYOUT)

  const pinned = toggleChart(DEFAULT_LAP_LAYOUT, 'brakeTemp')
  assert.deepEqual(pinned.charts, [...DEFAULT_LAP_LAYOUT.charts, 'brakeTemp'])
  assert.deepEqual(toggleChart(pinned, 'brakeTemp').charts, DEFAULT_LAP_LAYOUT.charts)
})

test('a chart moves one place, and stays put at either end', () => {
  assert.deepEqual(moveChart(DEFAULT_LAP_LAYOUT, 'steering', -1).charts, ['speed', 'steering', 'pedals', 'gear', 'settings'])
  assert.deepEqual(moveChart(DEFAULT_LAP_LAYOUT, 'steering', 1).charts, ['speed', 'pedals', 'gear', 'steering', 'settings'])
  assert.equal(moveChart(DEFAULT_LAP_LAYOUT, 'speed', -1), DEFAULT_LAP_LAYOUT)
  assert.equal(moveChart(DEFAULT_LAP_LAYOUT, 'settings', 1), DEFAULT_LAP_LAYOUT)
})

test('a stored layout keeps what it knows and drops what it does not', () => {
  assert.deepEqual(parseLapLayout(null), DEFAULT_LAP_LAYOUT)
  const stored = { map: false, car: false, charts: ['gear', 'boost', 'gear', 'speed'], pedalsSeparate: true, applied: false, tyreBand: 'Core', seen: ['speed', 'pedals', 'steering', 'gear', 'settings'] }
  assert.deepEqual(parseLapLayout(stored), { map: false, car: false, charts: ['gear', 'speed'], pedalsSeparate: true, applied: false, tyreBand: 'Core' })
  // Stored before the car was on the page: its card shows, its charts wait to be added.
  const older = parseLapLayout({ map: true, charts: ['speed'], pedalsSeparate: false, applied: true, tyreBand: 'Tread', seen: ['speed', 'pedals', 'steering', 'gear', 'settings'] })
  assert.deepEqual(older, { map: true, car: true, charts: ['speed'], pedalsSeparate: false, applied: true, tyreBand: 'Middle' })
})

test('a chart added since the layout was stored joins it once; one the driver removed stays removed', () => {
  // Stored before Car settings existed: it joins at the end.
  assert.deepEqual(parseLapLayout({ map: true, charts: ['gear', 'speed'], pedalsSeparate: false, applied: true }).charts, ['gear', 'speed', 'settings'])
  // Stored since, with Car settings removed: it stays off.
  const removed = storedLapLayout(removeChart(DEFAULT_LAP_LAYOUT, 'settings'))
  assert.deepEqual(parseLapLayout(JSON.parse(JSON.stringify(removed))).charts, ['speed', 'pedals', 'steering', 'gear'])
})
