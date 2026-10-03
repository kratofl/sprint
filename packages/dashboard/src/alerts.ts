// Stateful parameter-change alert detection, ported from the desktop client's
// `Features/Dashes/DashAlertTracker.cs` and `DashAttention.cs`. Compares each frame to the
// previous one for the alert types configured on the layout (tc/abs/engine-map) and produces
// a transient banner that expires after a fixed duration. There is no internal clock: callers
// drive time explicitly via `advanceTo`, which is what makes expiry deterministic to test.

import type { TelemetryFrame } from '@sprint/types'
import type { DashAlert, DashLayout } from './index'
import { canonicalAlertColorToken, findPresetByAlertColorToken, presetSwatchColor, type DashPaletteColors } from './palette'

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
export type DashAlertType = 'tc_change' | 'abs_change' | 'enginemap_change'

export const dashAlertTypes: readonly DashAlertType[] = ['tc_change', 'abs_change', 'enginemap_change']

/** A transient dash alert (parameter change), produced by DashAlertTracker.evaluate. */
export interface DashAlertBanner {
  title: string
  value: string
  color: string
  col: number
  row: number
  colSpan: number
  rowSpan: number
  gridCols: number
  gridRows: number
  invertColors: boolean
  condition: DashCondition
}

interface ResolvedAlertConfig {
  durationSeconds: number
  invertColors: boolean
  colorToken: string
}

const DEFAULT_ALERT_CONFIG: ResolvedAlertConfig = {
  durationSeconds: 1.5,
  invertColors: false,
  colorToken: 'auto',
}

/** Narrows the layout's untyped `alertConfig` bag to the fields this tracker reads. */
function readAlertConfig(raw: Record<string, unknown> | undefined): ResolvedAlertConfig {
  if (!raw) return DEFAULT_ALERT_CONFIG
  return {
    durationSeconds: typeof raw.durationSeconds === 'number' ? raw.durationSeconds : DEFAULT_ALERT_CONFIG.durationSeconds,
    invertColors: typeof raw.invertColors === 'boolean' ? raw.invertColors : DEFAULT_ALERT_CONFIG.invertColors,
    colorToken: typeof raw.colorToken === 'string' ? raw.colorToken : DEFAULT_ALERT_CONFIG.colorToken,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveAlertColor(token: string | undefined, fallback: string, palette: DashPaletteColors): string {
  const preset = findPresetByAlertColorToken(token)
  if (preset && preset.alertColorToken.toLowerCase() !== 'auto') {
    return presetSwatchColor(preset)
  }

  return canonicalAlertColorToken(token) === 'yellow' ? palette.warning : fallback
}

function createBanner(
  title: string,
  value: string,
  alert: DashAlert,
  fallbackColor: string,
  condition: DashCondition,
  config: ResolvedAlertConfig,
  layout: DashLayout,
  palette: DashPaletteColors,
): DashAlertBanner {
  return {
    title,
    value,
    color: resolveAlertColor(alert.colorToken ?? config.colorToken, fallbackColor, palette),
    col: alert.col,
    row: alert.row,
    colSpan: alert.colSpan,
    rowSpan: alert.rowSpan,
    gridCols: layout.gridCols,
    gridRows: layout.gridRows,
    invertColors: alert.invertColors ?? config.invertColors,
    condition,
  }
}

function detectCandidate(
  alert: DashAlert,
  frame: TelemetryFrame,
  prev: TelemetryFrame,
  config: ResolvedAlertConfig,
  layout: DashLayout,
  palette: DashPaletteColors,
): DashAlertBanner | null {
  switch (alert.type) {
    case 'tc_change':
      return frame.electronics.tc !== prev.electronics.tc
        ? createBanner('TRACTION CONTROL', String(frame.electronics.tc), alert, palette.assistActive, 'assistActive', config, layout, palette)
        : null
    case 'abs_change':
      return frame.electronics.abs !== prev.electronics.abs
        ? createBanner('ABS', String(frame.electronics.abs), alert, palette.warning, 'warning', config, layout, palette)
        : null
    case 'enginemap_change':
      return frame.electronics.motorMap !== prev.electronics.motorMap
        ? createBanner('ENGINE MAP', String(frame.electronics.motorMap), alert, palette.primary, 'neutral', config, layout, palette)
        : null
    default:
      return null
  }
}

/**
 * Feeds frames through the tc/abs/engine-map change detectors and holds the resulting banner
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
