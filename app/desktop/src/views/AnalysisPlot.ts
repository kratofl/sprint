import { chartScaleFor, lapsByRun, runTitle, tyreText } from './AnalysisDomain'
import type { CorpusLap, CorpusRun } from './AnalysisDomain'

/**
 * The session page's lap-times chart: one dot per lap in the order driven, runs side by side
 * with a gap between them, a dashed line at your best here. Positions are fractions of the plot
 * (x from the left, y from the top), so the view can lay dots out as HTML at any width. Pure.
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
