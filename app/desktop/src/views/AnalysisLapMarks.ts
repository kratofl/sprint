import type { ChartMark } from './AnalysisChart'
import type { CorpusLap, LapChannelTrace, LapNote } from './AnalysisDomain'

/**
 * Where on a lap something happened: the driver changed a car setting (TC, ABS, brake bias, …,
 * recorded as step channels in the trace — `LapTraceChannels` in LapChannelTrace.cs), or a note
 * was left there. Pure: traces and notes in, pins, lanes and labels out. The lap page draws the
 * pins over its charts and the "Car settings" chart from these.
 */

/** A setting the trace can carry, by its channel. */
export type CarSetting = {
  channel: string
  /** The lane's name in the Car settings chart. */
  name: string
  /** The pin's name, short enough to sit over a chart. */
  short: string
}

/** In the order the chart lists them. Mirrors `LapTraceChannels`' setting channels. */
export const CAR_SETTINGS: readonly CarSetting[] = [
  { channel: 'tc', name: 'TC', short: 'TC' },
  { channel: 'tcSlip', name: 'TC slip', short: 'Slip' },
  { channel: 'tcCut', name: 'TC cut', short: 'Cut' },
  { channel: 'abs', name: 'ABS', short: 'ABS' },
  { channel: 'brakeBiasRear', name: 'Brake bias', short: 'BB' },
  { channel: 'migration', name: 'Migration', short: 'Mig' },
  { channel: 'motorMap', name: 'Motor map', short: 'Map' },
  { channel: 'arbFront', name: 'ARB front', short: 'ARB F' },
  { channel: 'arbRear', name: 'ARB rear', short: 'ARB R' },
]

const BRAKE_BIAS = 'brakeBiasRear'

/**
 * What the driver reads off a raw channel value: brake bias as its front share to 0.1 %
 * (drivers set it by the front, the trace stores the rear 0–1, as the frame does), the rest as
 * the game's whole steps. Rounding here is also what keeps float noise from reading as a change.
 */
export const settingValue = (channel: string, raw: number): number => (channel === BRAKE_BIAS ? Math.round((1 - raw) * 1000) / 10 : Math.round(raw))

export const formatSettingValue = (channel: string, value: number): string => (channel === BRAKE_BIAS ? `${value.toFixed(1)} %` : String(value))

/** One stretch of the lap a setting held one value: from and to as lap fractions. */
export type SettingRun = { from: number; to: number; value: number }

/** A setting's values along the lap as runs, or null when the trace does not carry it. */
export function settingRuns(trace: LapChannelTrace, channel: string): SettingRun[] | null {
  const raw = trace.channels[channel]
  if (!raw || raw.length === 0) return null
  const last = raw.length - 1
  const runs: SettingRun[] = []
  for (let index = 0; index <= last; index++) {
    const value = settingValue(channel, raw[index])
    const at = Math.min(1, index * trace.positionStep)
    const open = runs[runs.length - 1]
    if (open && open.value === value) open.to = index === last ? 1 : at
    else {
      if (open) open.to = at
      runs.push({ from: at, to: index === last ? 1 : at, value })
    }
  }
  return runs
}

/** A setting changed at a place on the lap. */
export type SettingChange = { position: number; setting: CarSetting; from: number; to: number }

/** Every change of every setting the trace carries, in lap order. */
export function settingChanges(trace: LapChannelTrace): SettingChange[] {
  const changes: SettingChange[] = []
  for (const setting of CAR_SETTINGS) {
    const runs = settingRuns(trace, setting.channel) ?? []
    for (let index = 1; index < runs.length; index++) {
      changes.push({ position: runs[index].from, setting, from: runs[index - 1].value, to: runs[index].value })
    }
  }
  return changes.sort((a, b) => a.position - b.position)
}

/** Whether a trace carries any setting at all; older laps (and other games) do not. */
export const hasCarSettings = (trace: LapChannelTrace): boolean => CAR_SETTINGS.some((setting) => setting.channel in trace.channels)

/** One lane of the Car settings chart: a setting's runs on this lap and, compared, the other's. */
export type SettingLane = { setting: CarSetting; mine: SettingRun[] | null; other: SettingRun[] | null }

export type CarSettingsChart = {
  lanes: SettingLane[]
  /** The settings that never changed (and, compared, matched): "Migration 2 · Motor map 3 · ARB F3 R2". Null when none. */
  same: string | null
}

/**
 * The Car settings chart for a lap, or for two: one lane per setting that changed on either lap
 * or differs between them, the rest folded into one line. Null when neither lap carries settings.
 */
export function carSettingsChart(mine: LapChannelTrace, other: LapChannelTrace | null): CarSettingsChart | null {
  if (!hasCarSettings(mine) && !(other && hasCarSettings(other))) return null
  const lanes: SettingLane[] = []
  const folded: { setting: CarSetting; value: number }[] = []
  for (const setting of CAR_SETTINGS) {
    const ours = settingRuns(mine, setting.channel)
    const theirs = other ? settingRuns(other, setting.channel) : null
    if (ours === null && theirs === null) continue
    const steady = (runs: SettingRun[] | null) => runs !== null && runs.length === 1
    const same = other === null ? steady(ours) : steady(ours) && steady(theirs) && ours?.[0].value === theirs?.[0].value
    if (same && ours) folded.push({ setting, value: ours[0].value })
    else lanes.push({ setting, mine: ours, other: theirs })
  }
  return { lanes, same: foldedText(folded) }
}

/** "Migration 2 · Motor map 3 · ARB F3 R2": both anti-roll bars as one, as drivers say them. */
function foldedText(folded: readonly { setting: CarSetting; value: number }[]): string | null {
  const front = folded.find((entry) => entry.setting.channel === 'arbFront')
  const rear = folded.find((entry) => entry.setting.channel === 'arbRear')
  const parts = folded
    .filter((entry) => !(front && rear && (entry === front || entry === rear)))
    .map((entry) => `${entry.setting.name} ${formatSettingValue(entry.setting.channel, entry.value)}`)
  if (front && rear) parts.push(`ARB F${front.value} R${rear.value}`)
  return parts.length > 0 ? parts.join(' · ') : null
}

// ── Pins over the charts ──────────────────────────────────────────────────

/** Assumed lap length when neither the trace nor the lap says. Mirrors `LapChannelTrace.FallbackTrackLengthMeters`. */
export const FALLBACK_LAP_METERS = 5000

/** How long a lap is, in metres: what a note's distance is measured against. */
export const lapMeters = (trace: LapChannelTrace | null, lap: CorpusLap): number => trace?.trackLengthMeters ?? lap.context.trackLengthMeters ?? FALLBACK_LAP_METERS

/** Where a note sits on its lap, 0–1. */
export const notePosition = (note: LapNote, meters: number): number => Math.min(1, Math.max(0, note.distanceMeters / meters))

/** A pin over the charts: one place on one lap where settings changed, or a note. */
export type LapPin =
  | { kind: 'setting'; position: number; changes: SettingChange[] }
  | { kind: 'note'; position: number; note: LapNote }

// Changes closer than this (a fraction of the lap) are one pin: the driver turned two dials at once.
const SAME_PLACE = 0.002

/** The pins for one lap, in lap order: its setting changes (those at one place as one pin) and its notes. */
export function lapPins(changes: readonly SettingChange[], notes: readonly LapNote[], meters: number): LapPin[] {
  const pins: LapPin[] = []
  for (const change of changes) {
    const last = pins[pins.length - 1]
    if (last?.kind === 'setting' && change.position - last.position <= SAME_PLACE) last.changes.push(change)
    else pins.push({ kind: 'setting', position: change.position, changes: [change] })
  }
  for (const note of notes) pins.push({ kind: 'note', position: notePosition(note, meters), note })
  return pins.sort((a, b) => a.position - b.position)
}

/** A setting pin's text: "TC 5", or "TC 5 · ABS 3" for two at once. */
export const settingPinText = (changes: readonly SettingChange[]): string =>
  changes.map((change) => `${change.setting.short} ${formatSettingValue(change.setting.channel, change.to)}`).join(' · ')

const NOTE_PIN_WIDTH = 26
// Icon, gaps and padding of a setting pin; the text is 11px semibold, ~6.6px a character.
const SETTING_PIN_CHROME = 32
const PIN_CHAR = 6.6

/** How wide a pin draws, in px: enough to lay pins out before they are on screen. */
export const pinWidth = (pin: LapPin): number => (pin.kind === 'note' ? NOTE_PIN_WIDTH : Math.ceil(SETTING_PIN_CHROME + settingPinText(pin.changes).length * PIN_CHAR))

/**
 * Lays a row of pins out over a plot `plotWidth` px wide: each centred on its place where it can
 * be, pushed right past the one before it otherwise, then pulled back left from the right edge.
 * Returns each pin's left edge, in the order given (which must be by position). Only when the row
 * is wider than the plot do pins overlap.
 */
export function placePins(pins: readonly { position: number; width: number }[], plotWidth: number, gap: number = 4): number[] {
  const lefts = pins.map((pin) => pin.position * plotWidth - pin.width / 2)
  for (let index = 0; index < lefts.length; index++) {
    const before = index > 0 ? lefts[index - 1] + pins[index - 1].width + gap : 0
    lefts[index] = Math.max(lefts[index], before)
  }
  for (let index = lefts.length - 1; index >= 0; index--) {
    const after = index < lefts.length - 1 ? lefts[index + 1] - gap : plotWidth
    lefts[index] = Math.max(0, Math.min(lefts[index], after - pins[index].width))
  }
  return lefts
}

/** Where on the lap, as the bubble says it: "3.2 km · C3" when a corner is near, "3.2 km" otherwise. */
export function placeLabel(position: number, meters: number, corners: readonly ChartMark[]): string {
  const distance = `${((position * meters) / 1000).toFixed(1)} km`
  // Within ~150 m of a corner's slowest point, the note is about that corner.
  const reach = 150 / meters
  const corner = corners.reduce<ChartMark | null>(
    (best, mark) => (Math.abs(mark.position - position) <= reach && (best === null || Math.abs(mark.position - position) < Math.abs(best.position - position)) ? mark : best),
    null,
  )
  return corner ? `${distance} · ${corner.label}` : distance
}
