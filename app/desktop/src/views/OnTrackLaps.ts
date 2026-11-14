import { LAP_CHART_PANELS, buildLapTraceChartPanels, traceValueAt } from './AnalysisDomain'
import type { ChartPanel, ChartSample, CorpusLap, LapChannelTrace } from './AnalysisDomain'
import { isTarget } from './OnTrackDomain'
import type { CompareState } from './OnTrackDomain'

/**
 * On track's lap pages: one lap opened from the list, and two laps against each other. Which lap
 * is shown against which, how much time one gains on the other along the lap, and where the
 * corners are, all from the laps' recorded lines (`LapChannelTrace`). Pure; the view fetches the
 * traces and renders what this returns.
 */

/** A lap by what the host keys it on. */
export type LapKey = { sessionId: string; lapNumber: number }

/** Which of On track's three pages is showing. */
export type OnTrackPage = { kind: 'list' } | { kind: 'lap'; lap: LapKey } | { kind: 'compare'; first: LapKey; second: LapKey }

export const LIST_PAGE: OnTrackPage = { kind: 'list' }

export const lapKeyOf = (lap: CorpusLap): LapKey => ({ sessionId: lap.sessionId, lapNumber: lap.lapNumber })
export const sameLap = (a: LapKey, b: LapKey): boolean => a.sessionId === b.sessionId && a.lapNumber === b.lapNumber
export const findLap = (compare: CompareState, key: LapKey): CorpusLap | null => compare.laps.find((lap) => sameLap(lap, key)) ?? null

/** The laps that have a line to draw, fastest first: the only ones a lap page or compare can show. */
export const drawableLaps = (compare: CompareState): CorpusLap[] => compare.laps.filter((lap) => lap.hasChannels)

/** Your fastest lap here, or null with none of your own. */
export const yourBest = (compare: CompareState): CorpusLap | null => compare.laps.find((lap) => !lap.sharedFrom) ?? null

/** A page whose lap is gone (another course picked, a lap removed) falls back to the list. */
export function resolvePage(compare: CompareState, page: OnTrackPage): OnTrackPage {
  const known = (key: LapKey) => drawableLaps(compare).some((lap) => sameLap(lap, key))
  if (page.kind === 'lap') return known(page.lap) ? page : LIST_PAGE
  if (page.kind === 'compare') return known(page.first) && known(page.second) && !sameLap(page.first, page.second) ? page : LIST_PAGE
  return page
}

/**
 * Compare's opening pair: `from` (or the lap being chased, or the fastest) against your best, or
 * against the next fastest lap when that one is your best. Null with fewer than two laps to draw.
 */
export function comparePair(compare: CompareState, from: LapKey | null = null): { first: LapKey; second: LapKey } | null {
  const laps = drawableLaps(compare)
  const target = laps.find((lap) => isTarget(compare.target, lap)) ?? null
  const first = (from && laps.find((lap) => sameLap(lap, from))) ?? target ?? laps[0]
  return first ? pairAgainstBest(laps, lapKeyOf(first)) : null
}

/**
 * `from` against your best of `laps` (fastest first, each with a line), or against the next
 * fastest lap when `from` is your best. Null when `from` is not among them or nothing else is.
 */
export function pairAgainstBest(laps: readonly CorpusLap[], from: LapKey): { first: LapKey; second: LapKey } | null {
  const first = laps.find((lap) => sameLap(lap, from))
  if (!first) return null
  const best = laps.find((lap) => !lap.sharedFrom) ?? null
  const second = best && !sameLap(best, first) ? best : laps.find((lap) => !sameLap(lap, first))
  return second ? { first: lapKeyOf(first), second: lapKeyOf(second) } : null
}

/**
 * The lap a lap page measures against: your best, or — on your best itself — the lap being
 * chased. Null when there is nothing else to measure it against.
 */
export function referenceFor(compare: CompareState, lap: CorpusLap): CorpusLap | null {
  const laps = drawableLaps(compare)
  const best = laps.find((candidate) => !candidate.sharedFrom) ?? null
  if (best && !sameLap(best, lap)) return best
  const target = laps.find((candidate) => isTarget(compare.target, candidate)) ?? null
  return target && !sameLap(target, lap) ? target : null
}

/** How a lap stands against your best and against the lap being chased: seconds, negative = faster. */
export type LapStanding = { versusBest: number | null; versusTarget: number | null; isBest: boolean; isTarget: boolean }

export function lapStanding(compare: CompareState, lap: CorpusLap): LapStanding {
  const best = yourBest(compare)
  const target = compare.target
  const lapIsTarget = isTarget(target, lap)
  const round = (seconds: number) => Math.round(seconds * 1000) / 1000
  return {
    versusBest: best && !sameLap(best, lap) ? round(lap.lapTimeSeconds - best.lapTimeSeconds) : null,
    versusTarget: target && !lapIsTarget ? round(lap.lapTimeSeconds - target.lapTimeSeconds) : null,
    isBest: best !== null && sameLap(best, lap),
    isTarget: lapIsTarget,
  }
}

/** Who drove a lap, for headings and pickers: the friend, or "Your lap 5". */
export const lapOwner = (lap: CorpusLap): string => lap.sharedFrom ?? `Your lap ${lap.lapNumber}`

/** A lap's owner in a sentence: "Ada Brandt", or "your lap 5". */
export const lapOwnerInline = (lap: CorpusLap): string => lap.sharedFrom ?? `your lap ${lap.lapNumber}`

const ELAPSED = 'elapsedSeconds'
const SPEED = 'speedKph'

/** Points along the lap the time-gained line is drawn with. */
export const GAIN_SAMPLES = 500

/**
 * Seconds `lap` is ahead of `reference` at each point of the lap, from both laps' elapsed time:
 * positive where `lap` got there first. Null when either lap has no elapsed time recorded.
 */
export function timeGained(lap: LapChannelTrace, reference: LapChannelTrace, samples: number = GAIN_SAMPLES): ChartSample[] | null {
  if (!(ELAPSED in lap.channels) || !(ELAPSED in reference.channels)) return null
  const out: ChartSample[] = []
  for (let index = 0; index < samples; index++) {
    const x = index / (samples - 1)
    const mine = traceValueAt(lap, ELAPSED, x)
    const theirs = traceValueAt(reference, ELAPSED, x)
    if (mine !== null && theirs !== null) out.push({ x, y: theirs - mine })
  }
  return out
}

/** The time-gained line as a chart panel. */
export const timeGainedPanel = (title: string, samples: ChartSample[]): ChartPanel => ({
  title,
  unit: 's',
  series: [{ name: 'Time gained', samples, interpolation: 'Linear', role: 'Current', fillArea: false, tone: 'neutral', stroke: 'solid' }],
})

/** Both laps' speed in one panel: `lap` in the brand colour, `reference` as the comparison. */
export const speedPanel = (lap: LapChannelTrace, lapLabel: string, reference: LapChannelTrace, referenceLabel: string): ChartPanel =>
  buildLapTraceChartPanels(
    [
      { trace: lap, label: lapLabel, role: 'Current' },
      { trace: reference, label: referenceLabel, role: 'Comparison' },
    ],
    [LAP_CHART_PANELS.speed],
  )[0]

/**
 * A corner: a stretch of the lap around one slow point, numbered from the start line. Its
 * stretch runs from halfway after the previous corner to halfway before the next one, so the
 * stretches cover the whole lap and their gains add up to the lap's.
 */
export type Corner = {
  number: number
  /** The slow point, 0..1 along the lap. */
  position: number
  lapMinKph: number
  referenceMinKph: number
  /** Time `lap` gains on `reference` over the corner's stretch; null without elapsed time. */
  gainedSeconds: number | null
}

/** How far speed must drop, and climb back, for a slow point to count as a corner. */
export const CORNER_DROP_KPH = 15
const CORNER_SAMPLES = 500

/**
 * The corners of a lap, found where both laps' average speed dips by `CORNER_DROP_KPH` and climbs
 * back by as much. Empty when either lap has no speed recorded.
 */
export function findCorners(lap: LapChannelTrace, reference: LapChannelTrace, samples: number = CORNER_SAMPLES): Corner[] {
  if (!(SPEED in lap.channels) || !(SPEED in reference.channels)) return []
  const at = (index: number) => index / (samples - 1)
  const lapSpeed = Array.from({ length: samples }, (_, index) => traceValueAt(lap, SPEED, at(index)) ?? 0)
  const referenceSpeed = Array.from({ length: samples }, (_, index) => traceValueAt(reference, SPEED, at(index)) ?? 0)
  const mean = lapSpeed.map((speed, index) => (speed + referenceSpeed[index]) / 2)

  const slowest: number[] = []
  let peak = mean[0]
  let falling = false
  let low = 0
  for (let index = 0; index < samples; index++) {
    const speed = mean[index]
    if (!falling) {
      if (speed > peak) peak = speed
      else if (peak - speed >= CORNER_DROP_KPH) {
        falling = true
        low = index
      }
    } else if (speed < mean[low]) {
      low = index
    } else if (speed - mean[low] >= CORNER_DROP_KPH) {
      slowest.push(low)
      falling = false
      peak = speed
    }
  }
  if (falling) slowest.push(low)

  const gains = timeGained(lap, reference, samples)
  const bounds = [0, ...slowest.slice(1).map((index, k) => Math.round((slowest[k] + index) / 2)), samples - 1]
  return slowest.map((index, k) => {
    const from = bounds[k]
    const to = bounds[k + 1]
    return {
      number: k + 1,
      position: at(index),
      lapMinKph: Math.min(...lapSpeed.slice(from, to + 1)),
      referenceMinKph: Math.min(...referenceSpeed.slice(from, to + 1)),
      gainedSeconds: gains && gains.length === samples ? gains[to].y - gains[from].y : null,
    }
  })
}

/** The corners where `lap` gains most, biggest first: at most `count`, and only real gains. */
export const biggestGains = (corners: readonly Corner[], count = 3): Corner[] =>
  corners
    .filter((corner) => corner.gainedSeconds !== null && corner.gainedSeconds >= 0.001)
    .sort((a, b) => (b.gainedSeconds ?? 0) - (a.gainedSeconds ?? 0))
    .slice(0, count)

/** Where a corner is: "1.2 km" into the lap, or "34%" without the track's length. */
export const cornerWhere = (position: number, trackLengthMeters: number | null): string =>
  trackLengthMeters ? `${((position * trackLengthMeters) / 1000).toFixed(1)} km` : `${Math.round(position * 100)}%`

/** A signed time like "+0.090 s" / "−0.020 s". */
export const formatSignedSeconds = (seconds: number): string => `${seconds >= 0 ? '+' : '−'}${Math.abs(seconds).toFixed(3)} s`

/** A signed speed difference like "+7 km/h". */
export const formatSignedKph = (kph: number): string => {
  const rounded = Math.round(kph)
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : '±'}${Math.abs(rounded)} km/h`
}
