import { chartScaleFor, lapsByRun, runTitle, tyreText } from './AnalysisDomain'
import type { CorpusLap, CorpusRun } from './AnalysisDomain'

/**
 * The session page's lap-times chart: one dot per lap in the order driven, runs side by side
 * with a gap between them, a dashed line at your best here. Positions are fractions of the plot
 * (x from the left, y from the top), so the view can lay dots out as HTML at any width. Pure.
 * Below it, the lap page's distance window: which stretch of the lap its charts are zoomed to.
 */

export type PlotDot = {
  lap: CorpusLap
  x: number
  y: number
  /** Slower than the plot reaches (an out lap, a spin): drawn at the top edge. */
  clipped: boolean
}

export type PlotRun = { title: string; detail: string; from: number; to: number; dots: PlotDot[] }

export type PlotTick = { y: number; seconds: number }

export type LapTimesPlot = { runs: PlotRun[]; ticks: PlotTick[]; reference: { y: number; seconds: number } | null }

/** How much slower than the fastest lap the plot reaches; slower laps sit on its top edge. */
export const PLOT_REACH = 1.04

/** Room between two runs, in laps. */
const RUN_GAP = 0.8

/**
 * Lays out a session's laps. `yourBest` is the fastest lap of yours with this car here, from any
 * session; the plot reaches down to it so the line is always in view. Null with no timed laps.
 */
export function lapTimesPlot(laps: readonly CorpusLap[], runs: readonly CorpusRun[], yourBest: number | null): LapTimesPlot | null {
  const timed = laps.filter((lap) => lap.lapTimeSeconds > 0)
  if (timed.length === 0) return null
  const byNumber = [...timed].sort((a, b) => a.lapNumber - b.lapNumber)
  const groups = runs.length > 0 ? lapsByRun(byNumber, runs) : []
  const listed = groups.length > 0 ? groups : [{ run: null, laps: byNumber }]

  const fastest = Math.min(...timed.map((lap) => lap.lapTimeSeconds))
  const slowest = Math.max(...timed.map((lap) => lap.lapTimeSeconds))
  const low = yourBest !== null && yourBest > 0 ? Math.min(fastest, yourBest) : fastest
  const scale = chartScaleFor(low, Math.min(slowest, fastest * PLOT_REACH))
  const y = (seconds: number) => (scale.max - Math.min(seconds, scale.max)) / (scale.max - scale.min)

  const slots = listed.reduce((sum, group) => sum + group.laps.length, 0) + RUN_GAP * (listed.length - 1)
  let slot = 0
  const plotted = listed.map(({ run, laps: runLaps }) => {
    const from = slot / slots
    const dots = runLaps.map((lap) => {
      const dot = { lap, x: (slot + 0.5) / slots, y: y(lap.lapTimeSeconds), clipped: lap.lapTimeSeconds > scale.max }
      slot += 1
      return dot
    })
    const to = slot / slots
    slot += RUN_GAP
    return { title: run ? runTitle(run) : 'All laps', detail: run ? runDetail(run, runLaps) : '', from, to, dots }
  })

  const ticks: PlotTick[] = []
  for (let seconds = scale.min; seconds <= scale.max + scale.step / 2; seconds += scale.step) {
    ticks.push({ y: y(seconds), seconds: Math.round(seconds * 1000) / 1000 })
  }
  return {
    runs: plotted,
    ticks,
    reference: yourBest !== null && yourBest > 0 ? { y: y(yourBest), seconds: yourBest } : null,
  }
}

/** Under a run on the plot: its setup and tyres, "Race v3 · Medium", or "No setup picked · Soft front · Medium rear". */
function runDetail(run: CorpusRun, laps: readonly CorpusLap[]): string {
  const first = laps[0]
  const tyres = first ? tyreText(first.frontCompound, first.rearCompound) : null
  return [run.outing === 0 ? null : (run.setup?.name ?? 'No setup picked'), tyres].filter((part): part is string => part !== null).join(' · ')
}

/** An axis label to a tenth: "2:05.0". */
export function tickLabel(seconds: number): string {
  const tenths = Math.round(seconds * 10)
  const minutes = Math.floor(tenths / 600)
  const rest = (tenths % 600) / 10
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}

// ── The lap page's distance window ───────────────────────────────────────────
//
// Which stretch of the lap the lap page's charts show, shared by every chart in the stack so they
// zoom and pan together and the crosshair stays one position on track. Positions are fractions of
// the lap (0–1), the charts' own x. Pure: the view turns wheel, drag and key input into these calls.

/** A stretch of the lap, `from` < `to`, both within 0–1. */
export type LapWindow = { from: number; to: number }

export const WHOLE_LAP: LapWindow = { from: 0, to: 1 }

/** The narrowest stretch the charts zoom to: ~20 m of a 4 km track, ~70 m of Le Mans, still a few dozen samples. */
export const MIN_WINDOW_SPAN = 0.005

/** One +/− key press, or a wheel notch of about this much. */
export const ZOOM_STEP = 1.5

/** One ←/→ key press moves the crosshair this share of the window. */
const KEY_STEP = 0.01

export const windowSpan = (view: LapWindow): number => view.to - view.from

/** Whether the charts show less than the whole lap. */
export const isZoomed = (view: LapWindow): boolean => windowSpan(view) < 1 - 1e-9

/** Where a lap position lands across the window, 0 at its left edge and 1 at its right (outside the window, beyond them). */
export const acrossWindow = (view: LapWindow, position: number): number => (position - view.from) / windowSpan(view)

/** The lap position `across` (0–1) of the way over the window. */
export const positionInWindow = (view: LapWindow, across: number): number => view.from + across * windowSpan(view)

export const inWindow = (view: LapWindow, position: number): boolean => position >= view.from && position <= view.to

/** Keeps a window inside the lap without changing its width, and never narrower than `MIN_WINDOW_SPAN`. */
export function clampWindow(view: LapWindow): LapWindow {
  const span = Math.min(1, Math.max(MIN_WINDOW_SPAN, windowSpan(view)))
  const from = Math.min(1 - span, Math.max(0, view.from))
  return { from, to: from + span }
}

/**
 * Zooms by `factor` (under 1 in, over 1 out) around `anchor`, a lap position that stays where it
 * is on screen: the place under the mouse, or the crosshair at the keyboard.
 */
export function zoomWindow(view: LapWindow, factor: number, anchor: number): LapWindow {
  const span = Math.min(1, Math.max(MIN_WINDOW_SPAN, windowSpan(view) * factor))
  const at = Math.min(1, Math.max(0, acrossWindow(view, anchor)))
  return clampWindow({ from: anchor - at * span, to: anchor - at * span + span })
}

/** Moves the window `delta` of the lap along (negative back towards the start line), stopping at either end. */
export const panWindow = (view: LapWindow, delta: number): LapWindow => clampWindow({ from: view.from + delta, to: view.to + delta })

/** A wheel turn as a zoom factor: down (positive) zooms out, up zooms in, a notch (~100 px) about 1.2×. */
export const wheelZoomFactor = (deltaPixels: number): number => Math.exp(Math.max(-500, Math.min(500, deltaPixels)) * 0.002)

/** A drag of `pixels` across a plot `plotPixels` wide, as the lap distance the window moves: the trace follows the pointer. */
export const dragDelta = (view: LapWindow, pixels: number, plotPixels: number): number => (plotPixels > 0 ? (-pixels / plotPixels) * windowSpan(view) : 0)

/**
 * ←/→ at the keyboard: the crosshair moves a step of the window (from the window's edge when it
 * has none), and the window pans along when it would leave it.
 */
export function stepCursor(view: LapWindow, cursor: number | null, direction: -1 | 1): { view: LapWindow; cursor: number } {
  const start = cursor !== null && inWindow(view, cursor) ? cursor : direction > 0 ? view.from : view.to
  const next = Math.min(1, Math.max(0, start + direction * KEY_STEP * windowSpan(view)))
  if (inWindow(view, next)) return { view, cursor: next }
  return { view: panWindow(view, direction > 0 ? next - view.to : next - view.from), cursor: next }
}

/**
 * The axis labels under a window: five positions across it, in km to the precision the window's
 * width needs (a share of the lap when the track's length is unknown).
 */
export function windowTicks(view: LapWindow, trackLengthMeters: number | null): { position: number; across: number; label: string }[] {
  const spacing = windowSpan(view) / 4
  const label = (position: number): string => {
    if (trackLengthMeters === null) return `${(position * 100).toFixed(decimalsFor(spacing * 100, 0))}%`
    return `${((position * trackLengthMeters) / 1000).toFixed(decimalsFor((spacing * trackLengthMeters) / 1000, 1))} km`
  }
  return [0, 0.25, 0.5, 0.75, 1].map((across) => {
    const position = positionInWindow(view, across)
    return { position, across, label: label(position) }
  })
}

/** Enough decimals that labels `spacing` apart differ, and never fewer than `least`: the whole lap reads "3.5 km" and "50%". */
const decimalsFor = (spacing: number, least: number): number => Math.max(least, spacing >= 1 ? 0 : spacing >= 0.1 ? 1 : spacing >= 0.01 ? 2 : 3)

/**
 * The samples a window draws: those inside it and one either side, so a line runs to the edge of
 * the plot rather than stopping at the last sample inside. `samples` are by x.
 */
export function samplesInWindow<T extends { x: number }>(samples: T[], view: LapWindow): T[] {
  if (!isZoomed(view)) return samples
  let first = 0
  while (first < samples.length && samples[first].x < view.from) first++
  let last = samples.length - 1
  while (last >= 0 && samples[last].x > view.to) last--
  return samples.slice(Math.max(0, first - 1), Math.min(samples.length, last + 2))
}
