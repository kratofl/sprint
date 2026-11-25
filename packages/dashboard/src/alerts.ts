// Dash alerts as the app sees them: the alert types and their default settings, the popups an
// alert shows, and the sample popup the app plays so an alert's look can be set without the car.
// `pit_limiter` shows no popup: its setting only turns the pit limiter overlay on (pitLimiter.ts).
// `launch`, `pit_now` and `lift_now` are live: up while their condition holds. A flag out stays as
// a thin bar across the top once its popup is down, until Ack (the renderer's flag bar).
// Alerts are app-wide: the driver's settings (`DashAlertSettings`, stored by the host) are stamped
// onto every dash's layout as its `alerts` (`dashAlertFromSettings`), and the Rust renderer
// (renderer/src/alerts.rs) detects them on the wheel and draws every popup. `previewAlertBanner`
// here builds the same popup it would, so its look matches the wheel exactly.

import type { DashAlert, DashLayout, DashUnits } from './index'
import { canonicalAlertColorToken, dashColor, findPresetByAlertColorToken, presetSwatchColor, type DashPaletteColors } from './palette'
import type { DashMultiDialPopup } from './multiDial'

/**
 * Every alert type, by its wire id. `DashAlert.type` stays a plain string because it arrives
 * from stored JSON, but this is the authoritative set (a renderer test checks it against the
 * Rust list); consumers that offer alert types build their list from `dashAlertTypes`.
 */
export type DashAlertType =
  | 'tc_change' | 'abs_change' | 'bias_change' | 'enginemap_change' | 'migration_change' | 'arb_change' | 'dial_change'
  | 'pit_limiter' | 'launch' | 'flag' | 'penalty' | 'damage' | 'engine_warning' | 'fuel_low' | 'pit_now' | 'lift_now' | 'lap_summary'

export const dashAlertTypes: readonly DashAlertType[] = ['tc_change', 'abs_change', 'bias_change', 'enginemap_change', 'migration_change', 'arb_change', 'dial_change', 'pit_limiter', 'launch', 'flag', 'penalty', 'damage', 'engine_warning', 'fuel_low', 'pit_now', 'lift_now', 'lap_summary']

export const isDashAlertType = (value: unknown): value is DashAlertType => dashAlertTypes.some((type) => type === value)

/** How big an alert shows: a band across the middle of the dash, or the whole dash. The renderer draws a strip full when the screen is too short for it to read. */
export type DashAlertSize = 'strip' | 'full'

/** Where a popup sits on a stored layout alert (`DashAlert.displayMode`): a size, or "center", the alert's own grid rect (older per-dash layouts). */
export type DashAlertDisplayMode = DashAlertSize | 'center'

interface DashAlertSettingsBase {
  enabled: boolean
  /** Ignored by `lap_summary`, which always fills the dash, and `pit_limiter`, an overlay. */
  size: DashAlertSize
  invertColors: boolean
  /** `MIN_ALERT_SECONDS` to `maxAlertSeconds(type)`; ignored while `untilAck`. */
  durationSeconds: number
  /** Up until the driver presses Ack (or its condition ends: a flag in, a refuel, the clutch let out). Ignored by `pit_limiter`, up while the limiter is on. */
  untilAck: boolean
}

/**
 * The launch alert's window: it shows while the clutch is pressed more than `clutchPercent` and
 * the car is slower than `speedKmh` (stored metric, shown in the driver's units), green while the
 * revs and the throttle (%) are inside their from–to windows.
 */
export interface DashLaunchWindow {
  clutchPercent: number
  speedKmh: number
  rpmFrom: number
  rpmTo: number
  throttleFrom: number
  throttleTo: number
}

/** The alert types with settings of their own beside the look. */
type DashAlertTypeWithOwnSettings = 'fuel_low' | 'engine_warning' | 'launch' | 'lift_now'

/**
 * One alert type's app-wide settings, as the host stores them (`AppSettings.dashAlerts.alerts`).
 * `fuel_low` has the fuel warning's two levels, laps left: at `warningLapsLeft` the fuel widgets
 * turn amber, at `lapsLeft` red and LOW FUEL pops up (`warningLapsLeft` is never the smaller).
 * `engine_warning` has the engine's limits, °C, which the Water and Oil widgets warn from too
 * (amber from 10° under, red at them). `launch` has its window; `lift_now` the cue's lift point
 * (0–255), where the Lift & coast widget lights too. The widgets follow these whether or not the
 * alert is on.
 */
export type DashAlertSettings =
  | (DashAlertSettingsBase & { type: Exclude<DashAlertType, DashAlertTypeWithOwnSettings> })
  | (DashAlertSettingsBase & { type: 'fuel_low'; lapsLeft: number; warningLapsLeft: number })
  | (DashAlertSettingsBase & { type: 'engine_warning'; waterLimitCelsius: number; oilLimitCelsius: number })
  | (DashAlertSettingsBase & { type: 'launch' } & DashLaunchWindow)
  | (DashAlertSettingsBase & { type: 'lift_now'; liftPoint: number })

/** How long the lap summary stays up by default: longer than a setting popup, there is a whole lap to read. */
export const LAP_SUMMARY_SECONDS = 5

/** The longest the lap summary may stay up; every other alert keeps to `MAX_ALERT_SECONDS`. */
export const LAP_SUMMARY_MAX_SECONDS = 15

/** The shortest and longest an alert stays up (the renderer clamps to the same). */
export const MIN_ALERT_SECONDS = 1
export const MAX_ALERT_SECONDS = 30

/** The range of `fuel_low`'s two levels, `warningLapsLeft` and `lapsLeft`. */
export const FUEL_LAPS_LEFT_MIN = 1
export const FUEL_LAPS_LEFT_MAX = 9

/** The range of `lift_now`'s `liftPoint`, the game's cue (the renderer clamps to the same). */
export const LIFT_POINT_MIN = 0
export const LIFT_POINT_MAX = 255

/** The range of each launch setting (the renderer clamps to the same; `rpmTo`/`throttleTo` never under their from). */
export const LAUNCH_RANGES: Readonly<Record<keyof DashLaunchWindow, { min: number; max: number }>> = {
  clutchPercent: { min: 5, max: 95 },
  speedKmh: { min: 1, max: 50 },
  rpmFrom: { min: 1000, max: 20000 },
  rpmTo: { min: 1000, max: 20000 },
  throttleFrom: { min: 0, max: 100 },
  throttleTo: { min: 0, max: 100 },
}

/** The range of `engine_warning`'s limits, °C (the renderer clamps to the same). */
export const ENGINE_LIMIT_MIN = 60
export const ENGINE_LIMIT_MAX = 160

/** The longest an alert of `type` may stay up (the renderer clamps to the same). */
export function maxAlertSeconds(type: string): number {
  return type === 'lap_summary' ? LAP_SUMMARY_MAX_SECONDS : MAX_ALERT_SECONDS
}

const defaults = (type: Exclude<DashAlertType, DashAlertTypeWithOwnSettings>, enabled: boolean, size: DashAlertSize, durationSeconds: number, more: { untilAck?: true; invertColors?: true } = {}): DashAlertSettings =>
  ({ type, enabled, size, invertColors: more.invertColors ?? false, durationSeconds, untilAck: more.untilAck ?? false })

/**
 * Every alert type's settings before the driver changes them, in `dashAlertTypes` order: the
 * host takes these for a type its stored settings lack. An alert held until Ack keeps a duration
 * for when the driver turns that off.
 */
export const dashAlertDefaults: readonly DashAlertSettings[] = [
  defaults('tc_change', true, 'full', 2),
  defaults('abs_change', true, 'full', 2),
  defaults('bias_change', true, 'strip', 2),
  defaults('enginemap_change', true, 'strip', 2),
  defaults('migration_change', true, 'strip', 2),
  defaults('arb_change', false, 'strip', 2),
  defaults('dial_change', true, 'strip', 2),
  defaults('pit_limiter', true, 'strip', 3, { untilAck: true }),
  { type: 'launch', enabled: true, size: 'strip', invertColors: false, durationSeconds: 5, untilAck: true, clutchPercent: 50, speedKmh: 10, rpmFrom: 5000, rpmTo: 6000, throttleFrom: 20, throttleTo: 30 },
  defaults('flag', true, 'strip', 3),
  defaults('penalty', true, 'full', 5, { untilAck: true, invertColors: true }),
  defaults('damage', true, 'full', 5),
  { type: 'engine_warning', enabled: true, size: 'full', invertColors: true, durationSeconds: 5, untilAck: true, waterLimitCelsius: 110, oilLimitCelsius: 130 },
  { type: 'fuel_low', enabled: true, size: 'strip', invertColors: false, durationSeconds: 3, untilAck: true, lapsLeft: 2, warningLapsLeft: 4 },
  defaults('pit_now', true, 'strip', 5, { untilAck: true }),
  { type: 'lift_now', enabled: true, size: 'strip', invertColors: false, durationSeconds: 2, untilAck: true, liftPoint: 220 },
  defaults('lap_summary', true, 'full', LAP_SUMMARY_SECONDS),
]

/**
 * The layout alert the host stamps for one type's settings, so the renderer shows it on every
 * dash. Where it sits on the grid only matters to a "center" alert, which settings never make.
 */
export function dashAlertFromSettings(settings: DashAlertSettings): DashAlert {
  const alert: DashAlert = {
    id: settings.type,
    type: settings.type,
    enabled: settings.enabled,
    col: 0,
    row: 0,
    colSpan: 1,
    rowSpan: 1,
    displayMode: settings.size,
    invertColors: settings.invertColors,
    durationSeconds: settings.durationSeconds,
    untilAck: settings.untilAck,
  }
  switch (settings.type) {
    case 'fuel_low':
      return { ...alert, lapsLeft: settings.lapsLeft, warningLapsLeft: settings.warningLapsLeft }
    case 'engine_warning':
      return { ...alert, waterLimitCelsius: settings.waterLimitCelsius, oilLimitCelsius: settings.oilLimitCelsius }
    case 'launch': {
      const { clutchPercent, speedKmh, rpmFrom, rpmTo, throttleFrom, throttleTo } = settings
      return { ...alert, clutchPercent, speedKmh, rpmFrom, rpmTo, throttleFrom, throttleTo }
    }
    case 'lift_now':
      return { ...alert, liftPoint: settings.liftPoint }
    default:
      return alert
  }
}

/** Where a popup sits: the whole dash, a strip across its middle, or the alert's grid rect. */
export type DashAlertPlacement =
  | { displayMode: 'full' }
  | { displayMode: 'strip' }
  | { displayMode: 'center'; col: number; row: number; colSpan: number; rowSpan: number; gridCols: number; gridRows: number }

/**
 * A transient alert popup: a small title, the value big and a small detail line ("WAS 4",
 * "LAPS LEFT"), in the alert's colour (a fill, or the lettering when `invertColors`).
 */
export type DashAlertPopup = {
  kind: 'alert'
  alertType: DashAlertType
  title: string
  value: string
  detail: string | null
  color: string
  invertColors: boolean
} & DashAlertPlacement

/** How a sector time compares, like a timing screen: the fastest (purple), the driver's best (green), slower (yellow), or no bests to compare with yet. */
export type DashSectorRating = 'fastest' | 'personalBest' | 'slower' | 'unrated'

/** One sector of a finished lap: its time, its rating and its delta to the driver's best of it before the lap (null without one). */
export interface DashLapSector { seconds: number; rating: DashSectorRating; delta: number | null }

/**
 * The lap review: the full-screen summary of a finished lap (the `lap_summary` alert), as the
 * renderer captured it when the lap finished. A value is null when the game did not report it;
 * each delta is actual minus target (negative is better) and null when there is nothing to
 * compare against. Which values show is the layout's `lapReview` (see lapReview.ts).
 */
export interface DashLapSummaryPopup {
  kind: 'lapSummary'
  lap: number
  /** The session's lap limit, for "12 /24"; null when the session has none. */
  totalLaps: number | null
  /** The race position as the lap finished; null when the game reports none. */
  position: number | null
  /** The cars in the session, for "P4 /22". */
  totalPositions: number | null
  lapTime: number
  /** False when the game flagged the lap invalid; it never counts as a best. */
  valid: boolean
  /** Lap time minus the best valid lap before it. Negative is a new best. */
  lapDelta: number | null
  /** The best valid lap once this one is counted (this lap's own time when it is the best). */
  bestLap: number | null
  /** Lap time minus the plan's lap-time target the lap was driven with. Negative is faster. */
  targetDelta: number | null
  /** The lap's three sectors; null for a sector without a time. */
  sectors: [DashLapSector | null, DashLapSector | null, DashLapSector | null]
  /** Liters the lap used, or null when the lap's start was not seen or the car was refueled. */
  fuelUsed: number | null
  /** Fuel used minus the plan's per-lap target. Positive means over target. */
  fuelDelta: number | null
  /** Laps the fuel left lasts at the game's per-lap average. */
  fuelLeftLaps: number | null
  /** Virtual energy the lap used, percentage points; null for a car without it. */
  energyUsed: number | null
  /** Laps the virtual energy left lasts at the game's per-lap figure; null for a car without it. */
  energyLeftLaps: number | null
  /** The wear left on the most worn tyre, % (100 is new). */
  tyreWearLeft: number | null
  /** Seconds to the car ahead; null when there is none. */
  gapAhead: number | null
  /** The fastest the car went on the lap, m/s, as the host measured it; null when it did not. */
  topSpeed: number | null
}

/** What the renderer draws over the dash: the JSON `render_still` takes as its banner, the multi-dial popup included. */
export type DashAlertBanner = DashAlertPopup | DashLapSummaryPopup | DashMultiDialPopup

/** "auto" is the setting's own identity color; a named token overrides it with that preset's swatch. */
function resolveAlertColor(token: string | undefined, settingColor: string, palette: DashPaletteColors): string {
  const preset = findPresetByAlertColorToken(token)
  if (preset && preset.alertColorToken.toLowerCase() !== 'auto') {
    return presetSwatchColor(preset)
  }

  return canonicalAlertColorToken(token) === 'yellow' ? palette.warning : settingColor
}

/** Where an alert's popup sits: its own choice when it has one, otherwise full screen. */
function alertPlacement(alert: DashAlert, layout: DashLayout): DashAlertPlacement {
  const mode = alert.displayMode ?? 'full'
  if (mode === 'center') return { displayMode: 'center', col: alert.col, row: alert.row, colSpan: alert.colSpan, rowSpan: alert.rowSpan, gridCols: layout.gridCols, gridRows: layout.gridRows }
  return { displayMode: mode }
}

/**
 * A popup's made-up content. A setting change carries its identity colour, which a colour token may override; any other alert keeps its signal's colour.
 * A detail that shows a quantity is made in the driver's units.
 */
type Sample = { title: string; value: string; detail: string | null | ((units: DashUnits) => string) } & ({ setting: (palette: DashPaletteColors) => string } | { color: (palette: DashPaletteColors) => string })

/** Whole degrees in the driver's unit, as the renderer's `format_degrees` prints them. */
const sampleDegrees = (celsius: number, units: DashUnits): string => `${Math.round(units === 'Imperial' ? celsius * 1.8 + 32 : celsius)}°`

// The made-up popups the app plays an alert with (`sample` in alerts.rs).
const SAMPLES: Record<Exclude<DashAlertType, 'dial_change' | 'lap_summary' | 'pit_limiter'>, Sample> = {
  tc_change: { title: 'TC', value: '5', detail: 'WAS 4', setting: (p) => p.settingTc },
  abs_change: { title: 'ABS', value: '3', detail: 'WAS 4', setting: (p) => p.settingAbs },
  bias_change: { title: 'BIAS', value: '56.5', detail: 'WAS 56.0', setting: (p) => p.settingBrakeBias },
  enginemap_change: { title: 'MAP', value: '3', detail: 'WAS 2', setting: (p) => p.settingEngineMap },
  migration_change: { title: 'MIGRATION', value: '3', detail: 'WAS 2', setting: (p) => p.settingMigration },
  arb_change: { title: 'ARB F', value: '4', detail: 'WAS 3', setting: (p) => p.settingArb },
  launch: { title: 'LAUNCH', value: '5400', detail: 'THROTTLE 25%', color: (p) => p.success },
  flag: { title: 'FLAG', value: 'YELLOW', detail: null, color: (p) => p.raceControlYellow },
  penalty: { title: 'PENALTY', value: '1', detail: 'TO SERVE', color: (p) => p.critical },
  damage: { title: 'DAMAGE', value: 'FRONT LEFT', detail: 'HEAVY', color: (p) => p.critical },
  engine_warning: { title: 'ENGINE', value: 'OVERHEAT', detail: (units) => `WATER ${sampleDegrees(118, units)} · OIL ${sampleDegrees(142, units)}`, color: (p) => p.critical },
  fuel_low: { title: 'FUEL', value: '1.8', detail: 'LAPS LEFT', color: (p) => p.critical },
  pit_now: { title: 'FUEL', value: 'PIT NOW', detail: '1.1 LAPS LEFT', color: (p) => p.critical },
  lift_now: { title: 'LIFT & COAST', value: 'LIFT NOW', detail: null, color: (p) => p.warning },
}

// The made-up lap the app plays the lap review with (`SAMPLE_LAP` in alerts.rs): a new best whose sectors show all three timing colours.
const SAMPLE_LAP: DashLapSummaryPopup = {
  kind: 'lapSummary',
  lap: 12,
  totalLaps: 24,
  position: 4,
  totalPositions: 22,
  lapTime: 124.912,
  valid: true,
  lapDelta: -0.214,
  bestLap: 124.912,
  targetDelta: -0.088,
  sectors: [{ seconds: 38.412, rating: 'personalBest', delta: -0.104 }, { seconds: 44.187, rating: 'fastest', delta: -0.051 }, { seconds: 42.313, rating: 'slower', delta: 0.213 }],
  fuelUsed: 2.41,
  fuelDelta: -0.09,
  fuelLeftLaps: 12.4,
  energyUsed: 4.2,
  energyLeftLaps: 13.8,
  tyreWearLeft: 81,
  gapAhead: 1.384,
  topSpeed: 86.4,
}

/**
 * The popup `alert` would show, with made-up values, for the app to play on a dash so its look
 * can be set without the car. Built exactly as a real one is on the wheel, so it honours the
 * alert's own look, at either size, and prints in `units`. Null for a type the
 * renderer does not know, and for the pit limiter, an overlay that shows while the frame has the
 * limiter on (`previewFrame('pit')`).
 */
export function previewAlertBanner(layout: DashLayout, alert: DashAlert, palette: DashPaletteColors, units: DashUnits): DashAlertBanner | null {
  const type = alert.type
  if (!isDashAlertType(type) || type === 'pit_limiter') return null
  if (type === 'lap_summary') return SAMPLE_LAP
  const placement = alertPlacement(alert, layout)
  const invertColors = alert.invertColors ?? false
  if (type === 'dial_change') {
    return { kind: 'multiDial', caption: 'MULTI', label: 'TC2', color: dashColor.yellow, inverted: invertColors, displayMode: placement.displayMode === 'strip' ? 'strip' : 'full' }
  }
  const sample = SAMPLES[type]
  const color = 'setting' in sample ? resolveAlertColor(alert.colorToken, sample.setting(palette), palette) : sample.color(palette)
  const detail = typeof sample.detail === 'function' ? sample.detail(units) : sample.detail
  return { kind: 'alert', alertType: type, title: sample.title, value: sample.value, detail, color, invertColors, ...placement }
}

/**
 * The colour an alert colour token paints a popup, for a colour picker: a theme preset's
 * swatch, or the palette's warning yellow. Null for "auto" (each setting's own colour) and for
 * a token nothing knows.
 */
export function alertColorSwatch(token: string, palette: DashPaletteColors): string | null {
  const preset = findPresetByAlertColorToken(token)
  if (preset) return preset.alertColorToken.toLowerCase() === 'auto' ? null : presetSwatchColor(preset)
  return canonicalAlertColorToken(token) === 'yellow' ? palette.warning : null
}
