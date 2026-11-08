import { LAP_SAMPLE_COUNT, channelTone, traceValueAt } from './AnalysisDomain'
import type { ChartInterpolation, ChartPanel, ChartSample, ChartSeries, LapChannelTrace, SeriesStroke } from './AnalysisDomain'
import type { ChartMark } from './AnalysisChart'
import type { LapChartId, LapLayout } from './AnalysisLapLayout'
import { carSettingsChart } from './AnalysisLapMarks'
import type { CarSettingsChart } from './AnalysisLapMarks'
import { timeGained } from './OnTrackLaps'

/**
 * The lap page's charts, from the layout and the lap's trace (plus, when comparing, the other
 * lap's). Pure: samples in, panels out. A lap alone shows each channel in its colour, with what
 * reached the car after ABS/TC dotted beside the pedals; compared, the other lap joins every chart
 * grey and dashed, the time gained leads, and throttle and brake always split so no chart carries
 * four lines. The Car settings chart is not lines but lanes of steps (`AnalysisLapMarks.ts`); its
 * panel carries no series, and the page draws it from `settings`.
 */

/** A panel of the lap page and the chart it belongs to (`delta`, the time gained, is not the driver's to remove). */
export type LapPanelOf = LapChartId | 'delta'

export type LapCharts = {
  panels: ChartPanel[]
  /** Which chart each panel belongs to, by index: a split pedal chart is two panels of `pedals`. */
  owners: LapPanelOf[]
  heights: number[]
  notes: (string | null)[]
  /** The Car settings chart, when it is on the page and either lap carries settings. */
  settings: CarSettingsChart | null
}

export type ComparedLap = { trace: LapChannelTrace; label: string }

export const THROTTLE_APPLIED = 'throttleApplied'
export const BRAKE_APPLIED = 'brakeApplied'

const HEIGHT: Record<Exclude<LapPanelOf, 'settings'>, number> = { delta: 96, speed: 128, pedals: 112, steering: 96, gear: 88 }
const SPLIT_HEIGHT = 88

/** A Car settings lane: its name over one bar, or over two (yours, then the other lap's) when compared. */
export const SETTINGS_LANE = { label: 16, bar: 16, between: 3, after: 8 }

/** How tall the Car settings chart draws: its lanes, nothing when every setting folded into its head. */
export const settingsChartHeight = (chart: CarSettingsChart, compared: boolean): number =>
  chart.lanes.length * (SETTINGS_LANE.label + SETTINGS_LANE.bar + (compared ? SETTINGS_LANE.between + SETTINGS_LANE.bar : 0) + SETTINGS_LANE.after)

/** Whether the lap recorded what reached the car (older laps, and other games, do not). */
export const hasAppliedPedals = (trace: LapChannelTrace): boolean => THROTTLE_APPLIED in trace.channels && BRAKE_APPLIED in trace.channels

/**
 * A channel sampled along the lap. Gear holds its last gear through the neutral blip of every
 * shift: the raw channel drops to 0 between gears, which no driver would read as a gear.
 */
function sampled(trace: LapChannelTrace, channel: string, scale: number): ChartSample[] {
  if (!(channel in trace.channels)) return []
  const step = 1 / (LAP_SAMPLE_COUNT - 1)
  const samples: ChartSample[] = []
  let lastGear: number | null = null
  for (let index = 0; index < LAP_SAMPLE_COUNT; index++) {
    const x = index * step
    if (channel === 'gear') {
      // The nearest recorded gear, never a blend: halfway between 3 and the neutral blip is not 2nd.
      const gears = trace.channels.gear
      const gear = Math.round(gears[Math.min(gears.length - 1, Math.round(x / trace.positionStep))])
      if (gear > 0 || lastGear === null) lastGear = gear
      samples.push({ x, y: lastGear })
      continue
    }
    const raw = traceValueAt(trace, channel, x)
    if (raw !== null) samples.push({ x, y: raw * scale })
  }
  return samples
}

type Line = { channel: string; scale: number; name: string; stroke: SeriesStroke; fill?: boolean; interpolation?: ChartInterpolation }

function series(trace: LapChannelTrace, line: Line, other: boolean): ChartSeries {
  return {
    name: line.name,
    samples: sampled(trace, line.channel, line.scale),
    interpolation: line.interpolation ?? 'Linear',
    role: other ? 'Comparison' : 'Current',
    fillArea: line.fill === true,
    tone: other ? 'other' : channelTone(line.channel),
    stroke: line.stroke,
  }
}

const SPEED: Line = { channel: 'speedKph', scale: 1, name: 'Speed', stroke: 'solid' }
const THROTTLE: Line = { channel: 'throttle', scale: 100, name: 'Throttle', stroke: 'solid' }
const BRAKE: Line = { channel: 'brake', scale: 100, name: 'Brake', stroke: 'solid' }
const THROTTLE_GOT: Line = { channel: THROTTLE_APPLIED, scale: 100, name: 'Throttle the car got', stroke: 'dotted' }
const BRAKE_GOT: Line = { channel: BRAKE_APPLIED, scale: 100, name: 'Brake the car got', stroke: 'dotted' }
const STEERING: Line = { channel: 'steering', scale: 100, name: 'Steering', stroke: 'solid' }
const GEAR: Line = { channel: 'gear', scale: 1, name: 'Gear', stroke: 'solid', interpolation: 'Stepped' }

const NOT_RECORDED = 'ABS & TC not recorded for this lap'

export function buildLapCharts(layout: LapLayout, lap: ComparedLap, compared: ComparedLap | null): LapCharts {
  const out: LapCharts = { panels: [], owners: [], heights: [], notes: [], settings: null }
  const push = (owner: LapPanelOf, panel: ChartPanel, height: number, note: string | null = null) => {
    out.panels.push(panel)
    out.owners.push(owner)
    out.heights.push(height)
    out.notes.push(note)
  }
  // Compared: every line takes the lap's name, so the legend says whose line is whose.
  const mine = (line: Line): Line => (compared ? { ...line, name: lap.label } : line)
  const theirs = (line: Line): Line => ({ ...line, name: compared?.label ?? line.name, stroke: 'dashed', fill: false })
  // A channel a lap never recorded (what the car got, on an older lap) draws no line.
  const lines = (lineSpecs: readonly Line[], otherLine: Line | null): ChartSeries[] =>
    [
      ...lineSpecs.map((line) => series(lap.trace, mine(line), false)),
      ...(compared && otherLine ? [series(compared.trace, theirs(otherLine), true)] : []),
    ].filter((line) => line.samples.length > 0)

  if (compared) {
    const gained = timeGained(lap.trace, compared.trace)
    if (gained) {
      push(
        'delta',
        {
          title: `Time gained on ${compared.label}`,
          unit: 's',
          series: [{ name: 'Time gained', samples: gained, interpolation: 'Linear', role: 'Current', fillArea: false, tone: 'neutral', stroke: 'solid' }],
        },
        HEIGHT.delta,
      )
    }
  }

  // What the car got only beside a lap alone: compared, the chart is about the two laps.
  const applied = layout.applied && compared === null
  const appliedNote = applied && !hasAppliedPedals(lap.trace) ? NOT_RECORDED : null

  for (const chart of layout.charts) {
    switch (chart) {
      case 'speed':
        push('speed', { title: 'Speed', unit: 'km/h', series: lines([SPEED], SPEED) }, HEIGHT.speed)
        break
      case 'steering':
        push('steering', { title: 'Steering', unit: '%', series: lines([STEERING], STEERING) }, HEIGHT.steering)
        break
      case 'gear':
        push('gear', { title: 'Gear', unit: null, series: lines([GEAR], GEAR) }, HEIGHT.gear)
        break
      case 'settings': {
        // Older laps carry no settings: no chart rather than an empty one.
        const settings = carSettingsChart(lap.trace, compared?.trace ?? null)
        if (settings === null) break
        out.settings = settings
        const same = settings.same ? `${compared ? 'Same on both laps' : 'Same all lap'}: ${settings.same}` : null
        push('settings', { title: 'Car settings', unit: null, series: [] }, settingsChartHeight(settings, compared !== null), same)
        break
      }
      case 'pedals':
        if (layout.pedalsSeparate || compared) {
          push('pedals', { title: 'Throttle', unit: '%', series: lines(applied ? [THROTTLE, THROTTLE_GOT] : [THROTTLE], THROTTLE) }, SPLIT_HEIGHT, appliedNote)
          push('pedals', { title: 'Brake', unit: '%', series: lines(applied ? [{ ...BRAKE, fill: true }, BRAKE_GOT] : [{ ...BRAKE, fill: true }], BRAKE) }, SPLIT_HEIGHT)
        } else {
          const pedalLines: Line[] = applied ? [{ ...BRAKE, fill: true }, THROTTLE, BRAKE_GOT, THROTTLE_GOT] : [{ ...BRAKE, fill: true }, THROTTLE]
          push('pedals', { title: 'Throttle & brake', unit: '%', series: lines(pedalLines, null) }, HEIGHT.pedals, appliedNote)
        }
        break
    }
  }

  return out
}

/** The corners of a lap: where the speed bottoms out after a real drop, numbered from the line. */
export const CORNER_DROP_KPH = 25

export function lapCorners(trace: LapChannelTrace, samples: number = 600): ChartMark[] {
  if (!('speedKph' in trace.channels)) return []
  const speed: number[] = []
  for (let index = 0; index < samples; index++) speed.push(traceValueAt(trace, 'speedKph', index / (samples - 1)) ?? 0)

  // A few points either side smooth out the noise of a kerb or a lift.
  const smooth = speed.map((_, index) => {
    const from = Math.max(0, index - 3)
    const window = speed.slice(from, index + 4)
    return window.reduce((sum, value) => sum + value, 0) / window.length
  })

  // A corner is the slowest point within ~120 m either side; on an unknown length, 2 % of the lap.
  const length = trace.trackLengthMeters
  const reach = Math.max(2, Math.round(length && length > 0 ? (120 / length) * samples : samples * 0.02))
  const marks: ChartMark[] = []
  let last = -Infinity
  for (let index = reach; index < samples - reach; index++) {
    const value = smooth[index]
    let lowest = true
    for (let other = index - reach; other <= index + reach && lowest; other++) if (smooth[other] < value) lowest = false
    if (!lowest || index - last <= reach) continue
    const before = Math.max(...smooth.slice(Math.max(0, index - reach * 4), index))
    if (before - value < CORNER_DROP_KPH) continue
    marks.push({ position: index / (samples - 1), label: `C${marks.length + 1}` })
    last = index
  }
  return marks
}

/** Which of two laps is faster, and by how much: "Quali lap 3 is faster by 0.762 s". */
export function verdict(lapLabel: string, lapSeconds: number, otherLabel: string, otherSeconds: number): { faster: string; gap: number } | null {
  const gap = Math.abs(lapSeconds - otherSeconds)
  if (gap < 0.0005) return null
  return { faster: lapSeconds < otherSeconds ? lapLabel : otherLabel, gap }
}
