import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deltaTrend, formatDelta, hudMark, parseHudMessage, rememberDelta } from './hudModel'
import type { HudChart } from './hudModel'

test('the delta says ahead with a real minus and behind with a plus', () => {
  assert.deepEqual(formatDelta(-0.2141), { text: '−0.214', tone: 'ahead' })
  assert.deepEqual(formatDelta(0.3), { text: '+0.300', tone: 'behind' })
  assert.deepEqual(formatDelta(0.0002), { text: '0.000', tone: 'even' })
  assert.deepEqual(formatDelta(null), { text: '—', tone: 'even' })
})

test('a chart message keeps its samples and drops a domain that runs backwards', () => {
  const message = parseHudMessage({
    kind: 'chart',
    id: 'brake',
    arranging: false,
    panel: { title: 'Brake', unit: '%', series: [{ name: 'Target', role: 'Comparison', samples: [{ x: 1, y: 2 }, { x: 'bad', y: 3 }] }] },
    domain: { min: 10, max: 5 },
    carMeters: 7,
  })

  assert.equal(message?.kind, 'chart')
  if (message?.kind !== 'chart') return
  assert.equal(message.domain, null)
  assert.deepEqual(message.chart?.series[0].samples, [{ x: 1, y: 2 }])
  assert.equal(message.chart?.series[0].role, 'Comparison')
})

const chart = (unit: string, target: [number, number][]): HudChart => ({
  title: 'T',
  unit,
  series: [{ name: 'Target', role: 'Comparison', interpolation: 'Linear', fillArea: false, tone: 'neutral', stroke: 'dashed', samples: target.map(([x, y]) => ({ x, y })) }],
})

test('Brake points at where the target next brakes, ahead of the car only', () => {
  const brake = chart('%', [[900, 60], [950, 0], [1100, 0], [1180, 4], [1182, 80], [1300, 0]])

  assert.deepEqual(hudMark('brake', brake, 1000), { meters: 1182, label: 'Brake in 180 m' })
  assert.equal(hudMark('brake', brake, 1190), null, 'already in the braking zone: nothing new is coming')
  assert.equal(hudMark('throttle', brake, 1000), null)
})

test('Speed marks the target’s slowest point, but not a window that merely ends lower', () => {
  const corner = chart('km/h', [[1000, 280], [1200, 112], [1300, 130], [1600, 210]])
  const straightEnd = chart('km/h', [[1000, 280], [1300, 250], [1600, 200]])

  assert.deepEqual(hudMark('speed', corner, 990), { meters: 1200, label: 'Min 112 km/h' })
  assert.equal(hudMark('speed', straightEnd, 990), null)
})

test('the delta trend compares now with 200 m ago and starts over on a new lap', () => {
  let history = [0, 100, 200, 300].reduce((acc, meters, index) => rememberDelta(acc, { meters, seconds: -0.1 - index * 0.03 }), rememberDelta([], { meters: -1, seconds: -0.1 }))

  assert.deepEqual(deltaTrend(history), { text: 'Gaining 0.06', tone: 'ahead' })
  history = rememberDelta(history, { meters: 5, seconds: 0.2 })
  assert.equal(deltaTrend(history), null, 'a new lap has no 200 m behind it yet')
})
