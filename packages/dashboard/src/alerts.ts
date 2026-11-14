// Dash alerts as the editor sees them: the alert types, the popups an alert shows, and the
// sample popup the designer plays so an alert's look can be set without the car. The Rust
// renderer (renderer/src/alerts.rs) detects real changes on the wheel and draws every popup;
// `previewAlertBanner` here builds the same popup it would, so its look is the alert's own or
// the layout's exactly as on the wheel.

import type { DashAlert, DashLayout } from './index'
import { canonicalAlertColorToken, dashSettingColors, findPresetByAlertColorToken, presetSwatchColor, type DashPaletteColors } from './palette'
import type { DashMultiDialPopup } from './multiDial'

/**
 * The parameter changes a dash alert can fire on. `DashAlert.type` stays a plain
 * string because it arrives from stored JSON, but this is the authoritative set —
 * consumers that offer alert types to a user should build their list from it.
 */
export type DashAlertType = 'tc_change' | 'abs_change' | 'bias_change' | 'enginemap_change' | 'lap_summary'

export const dashAlertTypes: readonly DashAlertType[] = ['tc_change', 'abs_change', 'bias_change', 'enginemap_change', 'lap_summary']

type SettingAlertType = Exclude<DashAlertType, 'lap_summary'>

/**
 * A transient setting-change popup. `fullScreen` popups cover the whole dash in the
 * setting's color; otherwise the popup sits in the alert's own grid rect.
 */
export interface DashSettingPopup {
  kind: 'setting'
  title: string
  value: string
  /** The value before the change, shown small beside the new one. */
  previous: string
  /** The setting's highest step when the game reports one, for "of 9". */
  max: number | null
  color: string
  fullScreen: boolean
  col: number
  row: number
  colSpan: number
  rowSpan: number
  gridCols: number
  gridRows: number
  invertColors: boolean
}

/**
 * The full-screen summary of a finished lap. Each delta is actual minus target (negative is
 * better) and null when there is nothing to compare against.
 */
export interface DashLapSummaryPopup {
  kind: 'lapSummary'
  lap: number
  /** The session's lap limit, for "LAP 12 OF 24"; null when the session has none. */
  totalLaps: number | null
  /** The race position as the lap finished; null when the game reports none. */
  position: number | null
  lapTime: number
  /** False when the game flagged the lap invalid; it never counts as a best. */
  valid: boolean
  /** Lap time minus the best valid lap before it. Negative is a new best. */
  lapDelta: number | null
  /** Lap time minus the plan's lap-time target the lap was driven with. Negative is faster. */
  targetDelta: number | null
  /** Liters the lap used, or null when the lap's start was not seen or the car was refueled. */
  fuelUsed: number | null
  /** Fuel used minus the plan's per-lap target. Positive means over target. */
  fuelDelta: number | null
}

/** What the renderer draws over the dash: the JSON `render_still` takes as its banner, the multi-dial popup included. */
export type DashAlertBanner = DashSettingPopup | DashLapSummaryPopup | DashMultiDialPopup

/** How long the lap summary stays up unless its alert sets its own duration: longer than a setting popup, there is a whole lap to read. */
export const LAP_SUMMARY_SECONDS = 5

/** The longest the lap summary may stay up; every other alert keeps to `MAX_ALERT_SECONDS`. */
export const LAP_SUMMARY_MAX_SECONDS = 15

/** The shortest any alert stays up, and the longest a setting popup does. */
export const MIN_ALERT_SECONDS = 0.5
export const MAX_ALERT_SECONDS = 5

/** The longest an alert of `type` may stay up (the renderer clamps to the same). */
export function maxAlertSeconds(type: string): number {
  return type === 'lap_summary' ? LAP_SUMMARY_MAX_SECONDS : MAX_ALERT_SECONDS
}

interface ResolvedAlertConfig {
  fullScreen: boolean
  invertColors: boolean
  colorToken: string
}

const DEFAULT_ALERT_CONFIG: ResolvedAlertConfig = {
  fullScreen: true,
  invertColors: false,
  colorToken: 'auto',
}

/** Narrows the layout's untyped `alertConfig` bag to the look fields a popup reads. */
function readAlertConfig(raw: Record<string, unknown> | undefined): ResolvedAlertConfig {
  if (!raw) return DEFAULT_ALERT_CONFIG
  return {
    fullScreen: raw.displayMode !== 'center',
    invertColors: typeof raw.invertColors === 'boolean' ? raw.invertColors : DEFAULT_ALERT_CONFIG.invertColors,
    colorToken: typeof raw.colorToken === 'string' ? raw.colorToken : DEFAULT_ALERT_CONFIG.colorToken,
  }
}

/** "auto" is the setting's own identity color; a named token overrides it with that preset's swatch. */
function resolveAlertColor(token: string | undefined, settingColor: string, palette: DashPaletteColors): string {
  const preset = findPresetByAlertColorToken(token)
  if (preset && preset.alertColorToken.toLowerCase() !== 'auto') {
    return presetSwatchColor(preset)
  }

  return canonicalAlertColorToken(token) === 'yellow' ? palette.warning : settingColor
}

/** How each setting titles and colors its popup. */
const SETTINGS: Record<SettingAlertType, { title: string; color: string }> = {
  tc_change: { title: 'TC', color: dashSettingColors.tc },
  abs_change: { title: 'ABS', color: dashSettingColors.abs },
  bias_change: { title: 'BIAS', color: dashSettingColors.brakeBias },
  enginemap_change: { title: 'MAP', color: dashSettingColors.engineMap },
}

const isSettingAlertType = (type: string): type is SettingAlertType => type in SETTINGS

/** Whether an alert shows full screen: its own choice when it has one, otherwise the layout's. */
function alertFullScreen(alert: DashAlert, config: ResolvedAlertConfig): boolean {
  if (alert.displayMode === 'center') return false
  if (alert.displayMode === 'full') return true
  return config.fullScreen
}

/** A setting's change as the popup shows it. */
interface SettingChange {
  value: string
  previous: string
  max: number | null
}

/** The popup for one setting change, in the alert's look (its own, or the layout's). */
function settingPopup(alert: DashAlert, type: SettingAlertType, change: SettingChange, config: ResolvedAlertConfig, layout: DashLayout, palette: DashPaletteColors): DashSettingPopup {
  const setting = SETTINGS[type]
  return {
    kind: 'setting',
    title: setting.title,
    value: change.value,
    previous: change.previous,
    max: change.max,
    color: resolveAlertColor(alert.colorToken ?? config.colorToken, setting.color, palette),
    fullScreen: alertFullScreen(alert, config),
    col: alert.col,
    row: alert.row,
    colSpan: alert.colSpan,
    rowSpan: alert.rowSpan,
    gridCols: layout.gridCols,
    gridRows: layout.gridRows,
    invertColors: alert.invertColors ?? config.invertColors,
  }
}

// The made-up changes the designer plays an alert with.
const SAMPLE_CHANGES: Record<SettingAlertType, SettingChange> = {
  tc_change: { value: '5', previous: '4', max: 9 },
  abs_change: { value: '3', previous: '4', max: 9 },
  bias_change: { value: '56.5', previous: '56.0', max: null },
  enginemap_change: { value: '3', previous: '2', max: 9 },
}

const SAMPLE_LAP: DashLapSummaryPopup = {
  kind: 'lapSummary',
  lap: 12,
  totalLaps: 24,
  position: 4,
  lapTime: 124.912,
  valid: true,
  lapDelta: -0.214,
  targetDelta: -0.088,
  fuelUsed: 2.41,
  fuelDelta: -0.09,
}

/**
 * The popup `alert` would show, with made-up values, for the designer to play on the dash so its
 * look can be set without turning a knob in the car. Built exactly as a real change builds it
 * on the wheel, so it honours the alert's own look and the layout's. Null for a type the
 * renderer does not know.
 */
export function previewAlertBanner(layout: DashLayout, alert: DashAlert, palette: DashPaletteColors): DashAlertBanner | null {
  if (alert.type === 'lap_summary') return SAMPLE_LAP
  if (!isSettingAlertType(alert.type)) return null
  return settingPopup(alert, alert.type, SAMPLE_CHANGES[alert.type], readAlertConfig(layout.alertConfig), layout, palette)
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
