// Formatting utilities that mirror the Go widgets/format.go and format_prefs.go logic.
// All functions accept a FormatPreferences object and return display strings.

import type { FormatPreferences, LapFormat } from '@sprint/types'

export const DEFAULT_FORMAT_PREFERENCES: FormatPreferences = {
  lapFormat:      'M:SS.mmm',
  speedUnit:      'kph',
  tempUnit:       'c',
  pressureUnit:   'kpa',
  deltaPrecision: '3',
}

/** Merge overlay into base — non-undefined fields in overlay win. */
export function mergeFormatPreferences(
  base: FormatPreferences,
  overlay: Partial<FormatPreferences> | undefined,
): FormatPreferences {
  if (!overlay) return base
  return {
    lapFormat:      overlay.lapFormat      ?? base.lapFormat,
    speedUnit:      overlay.speedUnit      ?? base.speedUnit,
    tempUnit:       overlay.tempUnit       ?? base.tempUnit,
    pressureUnit:   overlay.pressureUnit   ?? base.pressureUnit,
    deltaPrecision: overlay.deltaPrecision ?? base.deltaPrecision,
  }
}

/** Resolve prefs, filling any undefined fields with compile-time defaults. */
export function resolvedPrefs(prefs: Partial<FormatPreferences> | undefined): FormatPreferences {
  return mergeFormatPreferences(DEFAULT_FORMAT_PREFERENCES, prefs)
}

// --- Lap / sector ---

function lapPlaceholder(format: LapFormat | undefined): string {
  if (format === 'M:SS.mm')  return '-.---.--'
  if (format === 'SS.mmm')   return '--.---'
  return '-.---.---'
}

/**
 * Format a lap time (seconds) according to prefs.lapFormat.
 * Returns a placeholder when sec ≤ 0.
 */
export function fmtLap(sec: number | undefined, prefs?: Partial<FormatPreferences>): string {
  const p = resolvedPrefs(prefs)
  if (!sec || sec <= 0) return lapPlaceholder(p.lapFormat)
  switch (p.lapFormat) {
    case 'M:SS.mm': {
      const totalCs = Math.round(sec * 100)
      if (totalCs <= 0) return lapPlaceholder(p.lapFormat)
      const m = Math.floor(totalCs / 6000)
      const rem = totalCs % 6000
      const s = Math.floor(rem / 100)
      const cs = rem % 100
      return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
    }
    case 'SS.mmm': {
      const totalMs = Math.round(sec * 1000)
      if (totalMs <= 0) return lapPlaceholder(p.lapFormat)
      return (totalMs / 1000).toFixed(3)
    }
    default: {
      const totalMs = Math.round(sec * 1000)
      if (totalMs <= 0) return lapPlaceholder(p.lapFormat)
      const m = Math.floor(totalMs / 60000)
      const rem = totalMs % 60000
      const s = Math.floor(rem / 1000)
      const ms = rem % 1000
      return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
    }
  }
}

/**
 * Format a sector time (seconds). Sectors always show as total seconds;
 * the lapFormat precision controls the decimal places.
 */
export function fmtSector(sec: number | undefined, prefs?: Partial<FormatPreferences>): string {
  const p = resolvedPrefs(prefs)
  if (!sec || sec <= 0) return '--.---'
  return p.lapFormat === 'M:SS.mm' ? sec.toFixed(2) : sec.toFixed(3)
}

// --- Delta / gap ---

/**
 * Format a signed delta (seconds) as "+0.123" / "-0.123".
 * Precision follows prefs.deltaPrecision.
 */
export function fmtDelta(sec: number, prefs?: Partial<FormatPreferences>): string {
  const p = resolvedPrefs(prefs)
  const dp = p.deltaPrecision === '2' ? 2 : 3
  const abs = Math.abs(sec).toFixed(dp)
  return sec >= 0 ? `+${abs}` : `-${abs}`
}

/**
 * Format a gap (seconds) as "+0.123" or "---" when zero.
 */
export function fmtGap(sec: number, prefs?: Partial<FormatPreferences>): string {
  if (sec === 0) return '---'
  const p = resolvedPrefs(prefs)
  const dp = p.deltaPrecision === '2' ? 2 : 3
  return `+${Math.abs(sec).toFixed(dp)}`
}

// --- Speed ---

/**
 * Format a speed value (m/s) according to prefs.speedUnit.
 */
export function fmtSpeed(ms: number, prefs?: Partial<FormatPreferences>): string {
  const p = resolvedPrefs(prefs)
  const v = p.speedUnit === 'mph' ? ms * 2.23694 : ms * 3.6
  return v.toFixed(0)
}

/** Return the display label for the active speed unit. */
export function speedUnitLabel(prefs?: Partial<FormatPreferences>): string {
  return resolvedPrefs(prefs).speedUnit === 'mph' ? 'MPH' : 'KM/H'
}

// --- Temperature ---

/**
 * Format a temperature value (°C) according to prefs.tempUnit.
 */
export function fmtTemp(celsius: number, prefs?: Partial<FormatPreferences>): string {
  const p = resolvedPrefs(prefs)
  if (p.tempUnit === 'f') return (celsius * 9 / 5 + 32).toFixed(1)
  return celsius.toFixed(1)
}

/** Return the display label for the active temperature unit. */
export function tempUnitLabel(prefs?: Partial<FormatPreferences>): string {
  return resolvedPrefs(prefs).tempUnit === 'f' ? '°F' : '°C'
}

// --- Pressure ---

/**
 * Format a pressure value (kPa) according to prefs.pressureUnit.
 */
export function fmtPressure(kpa: number, prefs?: Partial<FormatPreferences>): string {
  const p = resolvedPrefs(prefs)
  switch (p.pressureUnit) {
    case 'psi': return (kpa * 0.14504).toFixed(1)
    case 'bar': return (kpa / 100).toFixed(3)
    default:    return kpa.toFixed(1)
  }
}

/** Return the display label for the active pressure unit. */
export function pressureUnitLabel(prefs?: Partial<FormatPreferences>): string {
  const u = resolvedPrefs(prefs).pressureUnit
  if (u === 'psi') return 'PSI'
  if (u === 'bar') return 'bar'
  return 'kPa'
}
