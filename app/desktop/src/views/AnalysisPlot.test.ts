import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CorpusLap, CorpusRun } from './AnalysisDomain'
import { lapTimesPlot, tickLabel } from './AnalysisPlot'

function lap(lapNumber: number, lapTimeSeconds: number, outing: number): CorpusLap {
  return {
    sessionId: 'session-1',
    lapNumber,
    label: `Lap ${lapNumber}`,
    detail: '',
    lapTimeSeconds,
    tier: 'FullTrace',
    context: { game: 'LMU', trackCourse: 'Spa', carModel: 'Porsche 963', carType: null, livery: null, trackLengthMeters: null, carClass: null },
    sessionStartedAt: null,
    sharedFrom: null,
    traceId: `session-1/${lapNumber}`,
    hasChannels: true,
    unavailableReason: null,
    outing,
    frontCompound: 'Medium',
    rearCompound: 'Medium',
    fuelUsedLiters: null,
    completedAt: null,
  }
}

const run = (outing: number, number: number, setup: string | null): CorpusRun => ({
  outing,
  number,
  laps: 2,
  bestLapSeconds: 0,
  startedAt: null,
  setup: setup ? { snapshotId: `s-${setup}`, name: setup, setupId: setup } : null,
})

test('laps are laid out in the order driven, runs apart, faster lower, your best in view', () => {
  const laps = [lap(3, 125.3, 2), lap(1, 126.9, 1), lap(2, 125.4, 1)]
  const plot = lapTimesPlot(laps, [run(2, 2, null), run(1, 1, 'Race v3')], 124.98)
  assert.ok(plot)
  assert.deepEqual(
    plot.runs.map((entry) => [entry.title, entry.detail, entry.dots.map((dot) => dot.lap.lapNumber)]),
    [
      ['Run 1', 'Race v3 · Medium', [1, 2]],
      ['Run 2', 'No setup picked · Medium', [3]],
    ],
  )
  const [first, second] = plot.runs
  assert.ok(first.to < second.from, 'a gap between the runs')
  assert.ok(first.dots[0].y < first.dots[1].y, 'the slower lap sits higher')
  assert.ok(plot.reference && plot.reference.y > second.dots[0].y, 'your best is below the fastest lap here')
  assert.ok(plot.ticks.every((tick) => tick.y >= 0 && tick.y <= 1))
})

test('an out lap far slower than the rest sits on the top edge instead of squashing the plot', () => {
  const plot = lapTimesPlot([lap(1, 160, 1), lap(2, 125.4, 1), lap(3, 125.9, 1)], [run(1, 1, null)], null)
  assert.ok(plot)
  const [outLap, fast] = plot.runs[0].dots
  assert.equal(outLap.clipped, true)
  assert.equal(outLap.y, 0)
  assert.equal(fast.clipped, false)
  assert.equal(plot.reference, null)
})

test('a session with no timed laps has no plot, and axis labels read to a tenth', () => {
  assert.equal(lapTimesPlot([lap(1, 0, 1)], [], null), null)
  assert.equal(tickLabel(125), '2:05.0')
  assert.equal(tickLabel(119.96), '2:00.0')
})
