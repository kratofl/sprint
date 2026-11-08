import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LapChannelTrace } from './AnalysisDomain'
import { buildLapCharts, lapCorners, verdict } from './AnalysisLapCharts'
import { DEFAULT_LAP_LAYOUT } from './AnalysisLapLayout'

/** A 1 km lap with two corners (speed dips at 30 % and 70 %), a neutral blip in its gear, and optionally what the car got. */
function trace(applied: boolean): LapChannelTrace {
  const count = 201
  const xs = Array.from({ length: count }, (_, index) => index / (count - 1))
  const dip = (x: number, at: number) => 120 * Math.exp(-(((x - at) / 0.03) ** 2))
  const speed = xs.map((x) => 250 - dip(x, 0.3) - dip(x, 0.7))
  const channels: Record<string, number[]> = {
    speedKph: speed,
    throttle: speed.map((v) => (v > 240 ? 1 : 0)),
    brake: speed.map((v) => (v < 200 ? 0.8 : 0)),
    steering: xs.map(() => 0),
    gear: xs.map((_, index) => (index === 50 ? 0 : 5)),
    elapsedSeconds: xs.map((x) => x * 60),
  }
  if (applied) {
    channels.throttleApplied = channels.throttle.map((v) => v * 0.8)
    channels.brakeApplied = channels.brake.map((v) => v * 0.7)
  }
  return { version: 1, positionStep: 1 / (count - 1), trackLengthMeters: 1000, channels }
}

test('a lap alone: its channels in their own colours, what the car got dotted beside the pedals', () => {
  const charts = buildLapCharts(DEFAULT_LAP_LAYOUT, { trace: trace(true), label: 'Lap 5' }, null)
  assert.deepEqual(charts.panels.map((panel) => panel.title), ['Speed', 'Throttle & brake', 'Steering', 'Gear'])
  const pedals = charts.panels[1]
  assert.deepEqual(pedals.series.map((line) => [line.name, line.tone, line.stroke]), [
    ['Brake', 'brake', 'solid'],
    ['Throttle', 'throttle', 'solid'],
    ['Brake the car got', 'brake', 'dotted'],
    ['Throttle the car got', 'throttle', 'dotted'],
  ])
  assert.deepEqual(charts.notes, [null, null, null, null])
})

test('an older lap says ABS & TC were not recorded instead of drawing nothing', () => {
  const charts = buildLapCharts(DEFAULT_LAP_LAYOUT, { trace: trace(false), label: 'Lap 5' }, null)
  assert.deepEqual(charts.panels[1].series.map((line) => line.name), ['Brake', 'Throttle'])
  assert.equal(charts.notes[1], 'ABS & TC not recorded for this lap')
})

test('compared: time gained leads, the other lap is grey and dashed, and throttle and brake split', () => {
  const charts = buildLapCharts(DEFAULT_LAP_LAYOUT, { trace: trace(true), label: 'Lap 5' }, { trace: trace(false), label: 'Quali lap 3' })
  assert.deepEqual(charts.panels.map((panel) => panel.title), ['Time gained on Quali lap 3', 'Speed', 'Throttle', 'Brake', 'Steering', 'Gear'])
  assert.deepEqual(charts.owners, ['delta', 'speed', 'pedals', 'pedals', 'steering', 'gear'])
  assert.deepEqual(charts.panels[1].series.map((line) => [line.name, line.tone, line.stroke]), [
    ['Lap 5', 'speed', 'solid'],
    ['Quali lap 3', 'other', 'dashed'],
  ])
})

test('gear holds through the neutral blip of a shift', () => {
  const charts = buildLapCharts(DEFAULT_LAP_LAYOUT, { trace: trace(false), label: 'Lap 5' }, null)
  const gear = charts.panels[3].series[0]
  assert.ok(gear.samples.every((sample) => sample.y === 5))
})

test('corners are where the speed bottoms out after a real drop, numbered from the line', () => {
  const corners = lapCorners(trace(false))
  assert.deepEqual(corners.map((corner) => corner.label), ['C1', 'C2'])
  assert.ok(Math.abs(corners[0].position - 0.3) < 0.01)
  assert.ok(Math.abs(corners[1].position - 0.7) < 0.01)
})

test('the verdict names the faster lap', () => {
  assert.deepEqual(verdict('Lap 5', 125.263, 'Quali lap 3', 124.501), { faster: 'Quali lap 3', gap: 125.263 - 124.501 })
  assert.equal(verdict('Lap 5', 125.263, 'Lap 5 again', 125.263), null)
})
