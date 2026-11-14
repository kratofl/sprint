import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LapChannelTrace } from './AnalysisDomain'
import { buildLapCharts, chartRecorded, cornerGapLabel, lapCorners, lapMapComparison, shadeAt, verdict } from './AnalysisLapCharts'
import { DEFAULT_LAP_LAYOUT } from './AnalysisLapLayout'
import type { LapLayout } from './AnalysisLapLayout'

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
  return { version: 1, positionStep: 1 / (count - 1), trackLengthMeters: 1000, channels, car: null }
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

test('the Car settings chart: a panel of lanes, the unchanged settings in its head, none on an older lap', () => {
  const withSettings = (tc: number[]): LapChannelTrace => {
    const lap = trace(false)
    const count = lap.channels.speedKph.length
    return { ...lap, channels: { ...lap.channels, tc: Array.from({ length: count }, (_, index) => (index < count / 2 ? tc[0] : tc[tc.length - 1])), motorMap: Array.from({ length: count }, () => 3) } }
  }

  const alone = buildLapCharts(DEFAULT_LAP_LAYOUT, { trace: withSettings([3, 5]), label: 'Lap 5' }, null)
  const index = alone.owners.indexOf('settings')
  assert.equal(alone.panels[index].title, 'Car settings')
  assert.equal(alone.notes[index], 'Same all lap: Motor map 3')
  assert.deepEqual(alone.settings?.lanes.map((lane) => lane.setting.channel), ['tc'])

  const compared = buildLapCharts(DEFAULT_LAP_LAYOUT, { trace: withSettings([3, 5]), label: 'Lap 5' }, { trace: withSettings([5]), label: 'Ada' })
  assert.equal(compared.notes[compared.owners.indexOf('settings')], 'Same on both laps: Motor map 3')
  assert.ok(compared.heights[compared.owners.indexOf('settings')] > alone.heights[index])

  assert.equal(buildLapCharts(DEFAULT_LAP_LAYOUT, { trace: trace(false), label: 'Lap 5' }, null).owners.includes('settings'), false)
})

/** The lap with what the car reported: brakes per wheel (the fronts hotter), fuel, and no wheel loads. */
function withCar(lap: LapChannelTrace): LapChannelTrace {
  const flat = (value: number) => Array.from({ length: 51 }, () => value)
  return { ...lap, car: { positionStep: 1 / 50, channels: { fuel: flat(40), brakeTempFL: flat(500), brakeTempFR: flat(510), brakeTempRL: flat(400), brakeTempRR: flat(410), rideHeightFL: flat(0.05) } } }
}

test('a chart of the four wheels: one line per corner in its colour, in the unit of the chart', () => {
  const layout: LapLayout = { ...DEFAULT_LAP_LAYOUT, charts: ['brakeTemp', 'rideHeight', 'fuel'] }
  const charts = buildLapCharts(layout, { trace: withCar(trace(false)), label: 'Lap 5' }, null)
  assert.deepEqual(charts.panels.map((panel) => [panel.title, panel.unit]), [
    ['Brake temperature', '°C'],
    ['Ride height', 'mm'],
    ['Fuel', 'L'],
  ])
  assert.deepEqual(charts.panels[0].series.map((line) => [line.name, line.tone, line.samples[0].y]), [
    ['FL', 'fl', 500],
    ['FR', 'fr', 510],
    ['RL', 'rl', 400],
    ['RR', 'rr', 410],
  ])
  // Metres on the wire, millimetres on the chart; a wheel the lap has no reading for draws no line.
  assert.deepEqual(charts.panels[1].series.map((line) => [line.name, line.samples[0].y]), [['FL', 50]])
})

test('compared, a chart of the four wheels is a chart per wheel: this lap in the colour of its corner, the other grey and dashed', () => {
  const layout: LapLayout = { ...DEFAULT_LAP_LAYOUT, charts: ['brakeTemp'] }
  const charts = buildLapCharts(layout, { trace: withCar(trace(false)), label: 'Lap 5' }, { trace: withCar(trace(false)), label: 'Ada' })
  assert.deepEqual(charts.panels.map((panel) => panel.title), [
    'Time gained on Ada',
    'Brake temperature · front left',
    'Brake temperature · front right',
    'Brake temperature · rear left',
    'Brake temperature · rear right',
  ])
  assert.deepEqual(charts.owners.slice(1), ['brakeTemp', 'brakeTemp', 'brakeTemp', 'brakeTemp'])
  assert.deepEqual(charts.panels[2].series.map((line) => [line.name, line.tone, line.stroke]), [
    ['Lap 5', 'fr', 'solid'],
    ['Ada', 'other', 'dashed'],
  ])
})

test('what a lap did not record: its chart stays, empty, and Add chart can tell', () => {
  const layout: LapLayout = { ...DEFAULT_LAP_LAYOUT, charts: ['wheelLoad', 'tyreTemp', 'energy'] }
  const older = buildLapCharts(layout, { trace: trace(false), label: 'Lap 5' }, null)
  assert.deepEqual(older.panels.map((panel) => [panel.title, panel.series.length]), [
    ['Wheel load', 0],
    ['Tyre temperature · middle', 0],
    ['Battery & energy', 0],
  ])
  assert.equal(chartRecorded('brakeTemp', trace(false)), false)
  assert.equal(chartRecorded('speed', trace(false)), true)
  assert.equal(chartRecorded('brakeTemp', withCar(trace(false))), true)
  assert.equal(chartRecorded('wheelLoad', withCar(trace(false))), false)
})

/** The test lap (60 s, corners at 30 % and 70 %) with `extra(x)` seconds added to its clock by each place. */
function timed(extra: (x: number) => number): LapChannelTrace {
  const lap = trace(false)
  return { ...lap, channels: { ...lap.channels, elapsedSeconds: lap.channels.elapsedSeconds.map((seconds, index) => seconds + extra(index * lap.positionStep)) } }
}

/** `seconds` spread evenly between `from` and `to` along the lap. */
const spread = (seconds: number, from: number, to: number) => (x: number) => seconds * Math.min(1, Math.max(0, (x - from) / (to - from)))

test('the map: green where this lap gains, red where it loses, stronger the faster, even elsewhere', () => {
  // Over 0.25–0.35 (6 s), 0.6 s lost: 10 % of the time it took, the strongest red. Over 0.65–0.75, 0.06 s gained: 1 %, the faintest green.
  const lap = timed((x) => spread(0.6, 0.25, 0.35)(x) - spread(0.06, 0.65, 0.75)(x))
  const comparison = lapMapComparison(lap, trace(false), lapCorners(lap))
  assert.ok(comparison)
  assert.equal(shadeAt(comparison.shades, 0.1), 0)
  assert.equal(shadeAt(comparison.shades, 0.3), -3)
  assert.equal(shadeAt(comparison.shades, 0.5), 0)
  assert.equal(shadeAt(comparison.shades, 0.7), 1)
  assert.equal(shadeAt(comparison.shades, 0.9), 0)
})

test('the map: a lap a little slower all the way round is faintly red everywhere, a hair slower is even', () => {
  const slower = lapMapComparison(timed((x) => x * 0.6), trace(false), [])
  assert.ok(slower)
  assert.ok(slower.shades.every((shade) => shade === -1))
  const hair = lapMapComparison(timed((x) => x * 0.12), trace(false), [])
  assert.ok(hair)
  assert.ok(hair.shades.every((shade) => shade === 0))
})

test('each corner carries what the lap lost (+) or gained (−) over its stretch, and they add up to the lap', () => {
  const lap = timed((x) => spread(0.2, 0.25, 0.35)(x) - spread(0.1, 0.65, 0.75)(x) + spread(0.05, 0, 0.1)(x))
  const comparison = lapMapComparison(lap, trace(false), lapCorners(lap))
  assert.ok(comparison)
  // C1's stretch runs from the line to halfway to C2, so it takes the start's 0.05 s too.
  assert.deepEqual(comparison.corners.map((corner) => [corner.label, Math.round(corner.seconds * 1000) / 1000]), [
    ['C1', 0.25],
    ['C2', -0.1],
  ])
  assert.ok(Math.abs(comparison.corners.reduce((sum, corner) => sum + corner.seconds, 0) - 0.15) < 1e-9)
})

test('without elapsed time there is nothing to colour the map by', () => {
  const lap = trace(false)
  const { elapsedSeconds: _, ...channels } = lap.channels
  assert.equal(lapMapComparison({ ...lap, channels }, trace(false), lapCorners(lap)), null)
})

test('a corner gap reads to the hundredth, red when lost, green when gained', () => {
  assert.deepEqual(cornerGapLabel(0.312), { text: '+0.31', tone: 'loss' })
  assert.deepEqual(cornerGapLabel(-0.078), { text: '−0.08', tone: 'gain' })
  assert.deepEqual(cornerGapLabel(0.004), { text: '±0.00', tone: null })
})
