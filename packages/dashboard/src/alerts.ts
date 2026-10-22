// Stateful parameter-change alert detection, ported from the desktop client's
// `Features/Dashes/DashAlertTracker.cs` and `DashAttention.cs`. Compares each frame to the
// previous one for the alert types configured on the layout (tc/abs/brake bias/engine map) and
// produces a transient popup that expires after a fixed duration. There is no internal clock:
// callers drive time explicitly via `advanceTo`, which is what makes expiry deterministic to test.

import type { TelemetryFrame } from '@sprint/types'
import type { DashAlert, DashLayout } from './index'
import { canonicalAlertColorToken, dashSettingColors, findPresetByAlertColorToken, presetSwatchColor, type DashPaletteColors } from './palette'
import { formatBrakeBias } from './format'

export type DashCondition =
  | 'neutral'
  | 'goodOnTarget'
  | 'coldLow'
  | 'assistActive'
  | 'warning'
  | 'critical'
  | 'fault'
  | 'raceControl'

/**
 * The parameter changes a dash alert can fire on. `DashAlert.type` stays a plain
 * string because it arrives from stored JSON, but this is the authoritative set —
 * consumers that offer alert types to a user should build their list from it.
 */
export type DashAlertType = 'tc_change' | 'abs_change' | 'bias_change' | 'enginemap_change'

export const dashAlertTypes: readonly DashAlertType[] = ['tc_change', 'abs_change', 'bias_change', 'enginemap_change']

/**
 * A transient setting-change popup, produced by DashAlertTracker.evaluate. `fullScreen`
 * popups cover the whole dash in the setting's color; otherwise the popup sits in the
 * alert's own grid rect.
 */
export interface DashAlertBanner {
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

interface ResolvedAlertConfig {
  fullScreen: boolean
  durationSeconds: number
  invertColors: boolean
  colorToken: string
}

const DEFAULT_ALERT_CONFIG: ResolvedAlertConfig = {
  fullScreen: true,
  durationSeconds: 1.5,
  invertColors: false,
  colorToken: 'auto',
}

/** Narrows the layout's untyped `alertConfig` bag to the fields this tracker reads. */
function readAlertConfig(raw: Record<string, unknown> | undefined): ResolvedAlertConfig {
  if (!raw) return DEFAULT_ALERT_CONFIG
  return {
    fullScreen: raw.displayMode !== 'center',
    durationSeconds: typeof raw.durationSeconds === 'number' ? raw.durationSeconds : DEFAULT_ALERT_CONFIG.durationSeconds,
    invertColors: typeof raw.invertColors === 'boolean' ? raw.invertColors : DEFAULT_ALERT_CONFIG.invertColors,
    colorToken: typeof raw.colorToken === 'string' ? raw.colorToken : DEFAULT_ALERT_CONFIG.colorToken,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** "auto" is the setting's own identity color; a named token overrides it with that preset's swatch. */
function resolveAlertColor(token: string | undefined, settingColor: string, palette: DashPaletteColors): string {
  const preset = findPresetByAlertColorToken(token)
  if (preset && preset.alertColorToken.toLowerCase() !== 'auto') {
    return presetSwatchColor(preset)
  }

  return canonicalAlertColorToken(token) === 'yellow' ? palette.warning : settingColor
}

/** How each setting reads, prints and colors itself. Changes are detected on the printed value, so sensor noise below the display precision never fires. */
const SETTINGS: Record<DashAlertType, { title: string; color: string; value: (frame: TelemetryFrame) => string; max: (frame: TelemetryFrame) => number }> = {
  tc_change: { title: 'TC', color: dashSettingColors.tc, value: (frame) => String(Math.trunc(frame.electronics.tc)), max: (frame) => frame.electronics.tcMax },
  abs_change: { title: 'ABS', color: dashSettingColors.abs, value: (frame) => String(Math.trunc(frame.electronics.abs)), max: (frame) => frame.electronics.absMax },
  bias_change: { title: 'BIAS', color: dashSettingColors.brakeBias, value: (frame) => formatBrakeBias(frame.car.brakeBiasRear), max: () => 0 },
  enginemap_change: { title: 'MAP', color: dashSettingColors.engineMap, value: (frame) => String(Math.trunc(frame.electronics.motorMap)), max: (frame) => frame.electronics.motorMapMax },
}

const isDashAlertType = (type: string): type is DashAlertType => (dashAlertTypes as readonly string[]).includes(type)

function detectCandidate(
  alert: DashAlert,
  frame: TelemetryFrame,
  prev: TelemetryFrame,
  config: ResolvedAlertConfig,
  layout: DashLayout,
  palette: DashPaletteColors,
): DashAlertBanner | null {
  if (!isDashAlertType(alert.type)) return null
  const setting = SETTINGS[alert.type]
  const value = setting.value(frame)
  const previous = setting.value(prev)
  if (value === previous) return null

  const max = setting.max(frame)
  return {
    title: setting.title,
    value,
    previous,
    max: max > 0 ? max : null,
    color: resolveAlertColor(alert.colorToken ?? config.colorToken, setting.color, palette),
    fullScreen: config.fullScreen,
    col: alert.col,
    row: alert.row,
    colSpan: alert.colSpan,
    rowSpan: alert.rowSpan,
    gridCols: layout.gridCols,
    gridRows: layout.gridRows,
    invertColors: alert.invertColors ?? config.invertColors,
  }
}

/**
 * Feeds frames through the setting change detectors and holds the resulting banner
 * for its configured duration. Time is supplied explicitly via `advanceTo` (epoch
 * milliseconds) rather than read from a real clock, so expiry is exercised deterministically.
 */
export class DashAlertTracker {
  private readonly fallbackDurationSeconds: number
  private now = 0
  private prev: TelemetryFrame | null = null
  private active: DashAlertBanner | null = null
  private expiresAt = 0

  constructor(fallbackDurationSeconds = 1.5) {
    this.fallbackDurationSeconds = fallbackDurationSeconds
  }

  /** Advances the tracker's clock to `nowMs` (epoch milliseconds). Call before `evaluate`. */
  advanceTo(nowMs: number): void {
    this.now = nowMs
  }

  /** Feeds a frame in and returns the banner to draw this tick, or `null` when none is active. */
  evaluate(layout: DashLayout, frame: TelemetryFrame, palette: DashPaletteColors): DashAlertBanner | null {
    const config = readAlertConfig(layout.alertConfig)

    if (this.prev) {
      // Last configured alert that fired this frame wins (matches the desktop painter loop).
      for (const alert of layout.alerts) {
        if (!alert.enabled) continue
        const candidate = detectCandidate(alert, frame, this.prev, config, layout, palette)
        if (candidate) {
          this.active = candidate
          const requested = alert.durationSeconds ?? (config.durationSeconds <= 0 ? this.fallbackDurationSeconds : config.durationSeconds)
          const duration = clamp(requested, 0.5, 5.0)
          this.expiresAt = this.now + duration * 1000
        }
      }
    }

    this.prev = frame
    if (this.active && this.now < this.expiresAt) {
      return this.active
    }

    this.active = null
    return null
  }

  /** Clears change-tracking state (call when the link goes offline so a stale diff doesn't fire on reconnect). */
  reset(): void {
    this.prev = null
    this.active = null
  }
}

const CRITICAL_INVERSION_PHASE_MS = 250

/**
 * Whether a value's colors should be shown inverted this instant, for the blinking effect on
 * out-of-bounds "critical" readings (two stable/inverted phases per second). Only the
 * critical condition supports animated inversion — everything else never blinks.
 */
export function isAttentionInverted(condition: DashCondition, requested: boolean, activeForMs: number): boolean {
  if (!requested || condition !== 'critical' || activeForMs < 0) {
    return false
  }

  return Math.floor(activeForMs / CRITICAL_INVERSION_PHASE_MS) % 2 === 1
}
