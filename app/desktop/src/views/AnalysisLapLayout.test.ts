import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_LAP_LAYOUT, addChart, hiddenCharts, moveChart, parseLapLayout, removeChart, storedLapLayout } from './AnalysisLapLayout'

test('a removed chart is offered under Add chart and comes back at the end', () => {
  const removed = removeChart(DEFAULT_LAP_LAYOUT, 'speed')
  assert.deepEqual(removed.charts, ['pedals', 'steering', 'gear', 'settings'])
  assert.deepEqual(hiddenCharts(removed), ['speed'])
  assert.deepEqual(addChart(removed, 'speed').charts, ['pedals', 'steering', 'gear', 'settings', 'speed'])
  assert.equal(addChart(DEFAULT_LAP_LAYOUT, 'speed'), DEFAULT_LAP_LAYOUT)
})

test('a chart moves one place, and stays put at either end', () => {
  assert.deepEqual(moveChart(DEFAULT_LAP_LAYOUT, 'steering', -1).charts, ['speed', 'steering', 'pedals', 'gear', 'settings'])
  assert.deepEqual(moveChart(DEFAULT_LAP_LAYOUT, 'steering', 1).charts, ['speed', 'pedals', 'gear', 'steering', 'settings'])
  assert.equal(moveChart(DEFAULT_LAP_LAYOUT, 'speed', -1), DEFAULT_LAP_LAYOUT)
  assert.equal(moveChart(DEFAULT_LAP_LAYOUT, 'settings', 1), DEFAULT_LAP_LAYOUT)
})

test('a stored layout keeps what it knows and drops what it does not', () => {
  assert.deepEqual(parseLapLayout(null), DEFAULT_LAP_LAYOUT)
  assert.deepEqual(parseLapLayout({ map: false, charts: ['gear', 'rpm', 'gear', 'speed'], pedalsSeparate: true, applied: false, seen: ['speed', 'pedals', 'steering', 'gear', 'settings'] }), {
    map: false,
    charts: ['gear', 'speed'],
    pedalsSeparate: true,
    applied: false,
  })
})

test('a chart added since the layout was stored joins it once; one the driver removed stays removed', () => {
  // Stored before Car settings existed: it joins at the end.
  assert.deepEqual(parseLapLayout({ map: true, charts: ['gear', 'speed'], pedalsSeparate: false, applied: true }).charts, ['gear', 'speed', 'settings'])
  // Stored since, with Car settings removed: it stays off.
  const removed = storedLapLayout(removeChart(DEFAULT_LAP_LAYOUT, 'settings'))
  assert.deepEqual(parseLapLayout(JSON.parse(JSON.stringify(removed))).charts, ['speed', 'pedals', 'steering', 'gear'])
})
