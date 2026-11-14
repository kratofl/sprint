import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CorpusLap, CorpusRun } from './AnalysisDomain'
import {
  MIN_WINDOW_SPAN,
  WHOLE_LAP,
  acrossWindow,
  dragDelta,
  isZoomed,
  lapTimesPlot,
  panWindow,
  samplesInWindow,
  stepCursor,
  tickLabel,
  wheelZoomFactor,
  windowTicks,
  zoomWindow,
} from './AnalysisPlot'
import type { LapWindow } from './AnalysisPlot'

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

// ── The lap page's distance window ──────────────────────────────────────────

const near = (actual: LapWindow, expected: LapWindow) => {
  assert.ok(Math.abs(actual.from - expected.from) < 1e-9 && Math.abs(actual.to - expected.to) < 1e-9, `${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`)
}

test('zooming keeps the place under the cursor where it is, and stops at the lap and at the narrowest window', () => {
  const zoomed = zoomWindow(WHOLE_LAP, 0.5, 0.4)
  near(zoomed, { from: 0.2, to: 0.7 })
  assert.ok(Math.abs(acrossWindow(zoomed, 0.4) - acrossWindow(WHOLE_LAP, 0.4)) < 1e-9)

  // At the start line the window cannot reach back past it, so it keeps its width inside the lap.
  near(zoomWindow({ from: 0, to: 0.2 }, 2, 0.05), { from: 0, to: 0.4 })
  near(zoomWindow({ from: 0.5, to: 0.6 }, 100, 0.55), WHOLE_LAP)
  const narrowest = zoomWindow(WHOLE_LAP, 1e-6, 0.5)
  assert.ok(Math.abs(narrowest.to - narrowest.from - MIN_WINDOW_SPAN) < 1e-12)
  assert.equal(isZoomed(WHOLE_LAP), false)
  assert.equal(isZoomed(zoomed), true)
})

test('panning moves the window along the lap at its width and stops at either end', () => {
  near(panWindow({ from: 0.2, to: 0.4 }, 0.1), { from: 0.3, to: 0.5 })
  near(panWindow({ from: 0.2, to: 0.4 }, -0.5), { from: 0, to: 0.2 })
  near(panWindow({ from: 0.7, to: 0.9 }, 0.5), { from: 0.8, to: 1 })
  // Dragging right by a quarter of the plot shows the stretch before: the trace follows the pointer.
  assert.ok(Math.abs(dragDelta({ from: 0.2, to: 0.6 }, 100, 400) + 0.1) < 1e-12)
})

test('a wheel notch down zooms out, up zooms in, by the same amount either way', () => {
  assert.ok(wheelZoomFactor(100) > 1)
  assert.ok(Math.abs(wheelZoomFactor(100) * wheelZoomFactor(-100) - 1) < 1e-12)
})

test('the arrow keys move the crosshair a step of the window, and the window follows it off either edge', () => {
  const view = { from: 0.2, to: 0.4 }
  assert.deepEqual(stepCursor(view, 0.3, 1), { view, cursor: 0.302 })
  // From no crosshair, it starts at the window's own edge.
  assert.deepEqual(stepCursor(view, null, 1), { view, cursor: 0.202 })

  const off = stepCursor(view, 0.4, 1)
  assert.ok(Math.abs(off.cursor - 0.402) < 1e-12)
  near(off.view, { from: 0.202, to: 0.402 })
  // At the end of the lap there is nowhere further to go.
  assert.deepEqual(stepCursor(WHOLE_LAP, 1, 1), { view: WHOLE_LAP, cursor: 1 })
})

test('the axis reads the whole lap to a tenth of a km and a narrow window finely enough to tell its ticks apart', () => {
  assert.deepEqual(windowTicks(WHOLE_LAP, 7000).map((tick) => tick.label), ['0.0 km', '1.8 km', '3.5 km', '5.3 km', '7.0 km'])
  assert.deepEqual(windowTicks({ from: 0.5, to: 0.52 }, 7000).map((tick) => tick.label), ['3.50 km', '3.54 km', '3.57 km', '3.60 km', '3.64 km'])
  assert.deepEqual(windowTicks(WHOLE_LAP, null).map((tick) => tick.label), ['0%', '25%', '50%', '75%', '100%'])
})

test('a zoomed window draws its samples and one either side, so a line reaches the plot edges', () => {
  const samples = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map((x) => ({ x, y: x }))
  assert.equal(samplesInWindow(samples, WHOLE_LAP), samples)
  assert.deepEqual(samplesInWindow(samples, { from: 0.15, to: 0.32 }).map((sample) => sample.x), [0.1, 0.2, 0.3, 0.4])
  assert.deepEqual(samplesInWindow(samples, { from: 0.45, to: 0.9 }).map((sample) => sample.x), [0.4, 0.5])
})
