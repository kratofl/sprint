import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_LAP_LAYOUT, addChart, hiddenCharts, moveChart, parseLapLayout, removeChart } from './AnalysisLapLayout'

test('a removed chart is offered under Add chart and comes back at the end', () => {
  const removed = removeChart(DEFAULT_LAP_LAYOUT, 'speed')
  assert.deepEqual(removed.charts, ['pedals', 'steering', 'gear'])
  assert.deepEqual(hiddenCharts(removed), ['speed'])
  assert.deepEqual(addChart(removed, 'speed').charts, ['pedals', 'steering', 'gear', 'speed'])
  assert.equal(addChart(DEFAULT_LAP_LAYOUT, 'speed'), DEFAULT_LAP_LAYOUT)
})

test('a chart moves one place, and stays put at either end', () => {
  assert.deepEqual(moveChart(DEFAULT_LAP_LAYOUT, 'steering', -1).charts, ['speed', 'steering', 'pedals', 'gear'])
  assert.deepEqual(moveChart(DEFAULT_LAP_LAYOUT, 'steering', 1).charts, ['speed', 'pedals', 'gear', 'steering'])
  assert.equal(moveChart(DEFAULT_LAP_LAYOUT, 'speed', -1), DEFAULT_LAP_LAYOUT)
  assert.equal(moveChart(DEFAULT_LAP_LAYOUT, 'gear', 1), DEFAULT_LAP_LAYOUT)
})

test('a stored layout keeps what it knows and drops what it does not', () => {
  assert.deepEqual(parseLapLayout(null), DEFAULT_LAP_LAYOUT)
  assert.deepEqual(parseLapLayout({ map: false, charts: ['gear', 'rpm', 'gear', 'speed'], pedalsSeparate: true, applied: false }), {
    map: false,
    charts: ['gear', 'speed'],
    pedalsSeparate: true,
    applied: false,
  })
})
