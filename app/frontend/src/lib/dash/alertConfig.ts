import type { AlertColorMode, AlertConfig, AlertDisplayMode, AlertInstance } from './types.ts'

// The established shared alert duration in seconds. Mirrors the Go
// alerts.DefaultAlertDuration constant.
export const DEFAULT_ALERT_DURATION = 1.5
export const DEFAULT_ALERT_DISPLAY_MODE: AlertDisplayMode = 'full'
export const DEFAULT_ALERT_COLOR_MODE: AlertColorMode = 'normal'

function durationOf(instance: AlertInstance): number {
  const raw = instance.config?.duration
  const value = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : NaN
  return Number.isFinite(value) ? value : 0
}

/**
 * Fold legacy per-instance alerts into the shared dashboard AlertConfig. Mirrors
 * the Go alerts.MigrateAlertConfig contract: idempotent once enabledTypes is set,
 * fills the established display/color/duration defaults, dedupes + sorts enabled
 * types, and collapses per-instance durations into one safe shared duration (the
 * longest meaningful value, else the default).
 */
export function migrateAlertConfig(
  legacy: AlertInstance[] | undefined,
  existing: AlertConfig | undefined,
): AlertConfig {
  const out: AlertConfig = { ...(existing ?? {}) }

  if ((out.enabledTypes?.length ?? 0) === 0 && legacy && legacy.length > 0) {
    const types = new Set<string>()
    let maxDuration = 0
    for (const instance of legacy) {
      if (!instance.type) continue
      types.add(instance.type)
      maxDuration = Math.max(maxDuration, durationOf(instance))
    }
    out.enabledTypes = [...types].sort()
    if ((out.duration ?? 0) <= 0 && maxDuration > 0) {
      out.duration = maxDuration
    }
  }

  return {
    displayMode: out.displayMode ?? DEFAULT_ALERT_DISPLAY_MODE,
    colorMode: out.colorMode ?? DEFAULT_ALERT_COLOR_MODE,
    duration: (out.duration ?? 0) > 0 ? out.duration : DEFAULT_ALERT_DURATION,
    enabledTypes: out.enabledTypes ?? [],
  }
}
