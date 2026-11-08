import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LapChannelTrace, LapNote } from './AnalysisDomain'
import { carSettingsChart, lapPins, placeLabel, placePins, settingChanges, settingPinText, settingRuns } from './AnalysisLapMarks'

/** A 1 km lap on 101 grid points with the given setting channels, each as [value, from index][] steps. */
function trace(settings: Record<string, [number, number][]>): LapChannelTrace {
  const count = 101
  const channels: Record<string, number[]> = { speedKph: Array.from({ length: count }, () => 200) }
  for (const [channel, steps] of Object.entries(settings)) {
    channels[channel] = Array.from({ length: count }, (_, index) => steps.filter(([, from]) => from <= index).at(-1)?.[0] ?? steps[0][0])
  }
  return { version: 1, positionStep: 1 / (count - 1), trackLengthMeters: 1000, channels }
}

const note = (id: string, distanceMeters: number, mine = true): LapNote => ({ id, distanceMeters, text: 'Brake later', author: 'Ada', createdAt: '', mine })

test('a setting reads as runs along the lap, brake bias by its front share', () => {
  const lap = trace({ tc: [[3, 0], [5, 40]], brakeBiasRear: [[0.46, 0], [0.468, 70]] })

  assert.deepEqual(settingRuns(lap, 'tc'), [
    { from: 0, to: 0.4, value: 3 },
    { from: 0.4, to: 1, value: 5 },
  ])
  assert.deepEqual(settingRuns(lap, 'brakeBiasRear')?.map((run) => run.value), [54, 53.2])
  assert.equal(settingRuns(lap, 'abs'), null)
})

test('changes are where a value steps, in lap order, and float noise is not one', () => {
  const lap = trace({ abs: [[4, 0], [3, 80]], tc: [[3, 0], [5, 40]], brakeBiasRear: [[0.46, 0], [0.4600001, 50]] })

  const changes = settingChanges(lap)

  assert.deepEqual(
    changes.map((change) => [change.setting.channel, change.position, change.from, change.to]),
    [
      ['tc', 0.4, 3, 5],
      ['abs', 0.8, 4, 3],
    ],
  )
})

test('alone: a lane per setting changed, the rest fold into one line with both bars as one', () => {
  const lap = trace({ tc: [[3, 0], [5, 40]], migration: [[2, 0]], motorMap: [[3, 0]], arbFront: [[3, 0]], arbRear: [[2, 0]] })

  const chart = carSettingsChart(lap, null)

  assert.deepEqual(chart?.lanes.map((lane) => lane.setting.channel), ['tc'])
  assert.equal(chart?.same, 'Migration 2 · Motor map 3 · ARB F3 R2')
})

test('compared: a setting that differs between the laps gets a lane even when neither changed it', () => {
  const mine = trace({ tc: [[3, 0], [5, 40]], abs: [[4, 0]], motorMap: [[3, 0]] })
  const other = trace({ tc: [[5, 0]], abs: [[3, 0]], motorMap: [[3, 0]] })

  const chart = carSettingsChart(mine, other)

  assert.deepEqual(chart?.lanes.map((lane) => lane.setting.channel), ['tc', 'abs'])
  assert.deepEqual(chart?.lanes[1].other, [{ from: 0, to: 1, value: 3 }])
  assert.equal(chart?.same, 'Motor map 3')
})

test('laps without settings have no chart', () => {
  assert.equal(carSettingsChart(trace({}), null), null)
  assert.equal(carSettingsChart(trace({}), trace({})), null)
})

test('pins: two dials turned at once are one pin, notes sit at their distance', () => {
  const lap = trace({ tc: [[3, 0], [5, 40]], abs: [[4, 0], [3, 40]] })

  const pins = lapPins(settingChanges(lap), [note('a', 250)], 1000)

  assert.deepEqual(
    pins.map((pin) => [pin.kind, pin.position]),
    [
      ['note', 0.25],
      ['setting', 0.4],
    ],
  )
  const setting = pins[1]
  assert.equal(setting.kind === 'setting' ? settingPinText(setting.changes) : null, 'TC 5 · ABS 3')
})

test('pins never overlap and never leave the plot', () => {
  const lefts = placePins(
    [
      { position: 0, width: 40 },
      { position: 0.01, width: 40 },
      { position: 0.5, width: 30 },
      { position: 0.99, width: 40 },
      { position: 1, width: 40 },
    ],
    500,
  )

  assert.deepEqual(lefts, [0, 44, 235, 416, 460])
})

test('a place reads in km, with the corner when one is near', () => {
  const corners = [{ position: 0.46, label: 'C3' }]

  assert.equal(placeLabel(0.457, 7000, corners), '3.2 km · C3')
  assert.equal(placeLabel(0.2, 7000, corners), '1.4 km')
})
