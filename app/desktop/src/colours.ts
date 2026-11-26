import { colourThemes, defaultDashColours } from '@sprint/dashboard'
import type { DashColourLimits, DashColours } from '@sprint/dashboard'

/**
 * The app-wide Colours setting (`AppSettings.Colours`, `ColourSettings` in Core): which theme
 * colours the cold–good–warm–hot scale, where values move along it, and whether the dash's gear
 * shows the redline. The wheel dash reads it in
 * its scene settings (`DashColoursContext`); the pit wall and Analysis colour by the same marks
 * here, in the theme's colours (`--heat-*` in styles.css, picked by `<html data-colours>`).
 */

/** Where a value sits on the scale; the pit wall and Analysis colour by it (`--heat-*` in styles.css). */
export type Heat = 'cold' | 'ok' | 'warm' | 'hot'

/** The ideal tyre temperature assumed when the game names none for the compound, °C (the renderer's `FALLBACK_TYRE_IDEAL`). */
export const FALLBACK_TYRE_IDEAL = 90

/** A tyre temperature (°C) against the compound's ideal (0 when unknown): the renderer's `tyre_heat`. */
export function tyreHeat(celsius: number, optimal: number, limits: DashColourLimits): Heat {
  const ideal = optimal > 0 ? optimal : FALLBACK_TYRE_IDEAL
  if (celsius > ideal + limits.tyreHotAbove) return 'hot'
  if (celsius > ideal + limits.tyreWarmAbove) return 'warm'
  if (celsius < ideal - limits.tyreColdBelow) return 'cold'
  return 'ok'
}

/** A brake disc temperature (°C): the renderer's `brake_heat`. */
export function brakeHeat(celsius: number, limits: DashColourLimits): Heat {
  if (celsius > limits.brakeHotAbove) return 'hot'
  if (celsius > limits.brakeWarmAbove) return 'warm'
  if (celsius < limits.brakeColdBelow) return 'cold'
  return 'ok'
}

/** Tread left (%): good, then low and critical under their marks; the renderer's `wear_color`. */
export function wearHeat(treadPercent: number, limits: DashColourLimits): Exclude<Heat, 'cold'> {
  if (treadPercent < limits.wearCriticalBelow) return 'hot'
  if (treadPercent < limits.wearLowBelow) return 'warm'
  return 'ok'
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const LIMIT_KEYS = Object.keys(defaultDashColours.limits).filter((key): key is keyof DashColourLimits => key in defaultDashColours.limits)

/** Narrows the host's `settings.colours` once; anything missing or unknown is the default. */
export function parseColours(value: unknown): DashColours {
  if (!isRecord(value)) return defaultDashColours
  const theme = colourThemes.find((candidate) => candidate === value.theme) ?? defaultDashColours.theme
  const raw = isRecord(value.limits) ? value.limits : {}
  const limits = { ...defaultDashColours.limits }
  for (const key of LIMIT_KEYS) {
    const number = raw[key]
    if (typeof number === 'number' && Number.isFinite(number)) limits[key] = number
  }
  const gearRedline = typeof value.gearRedline === 'boolean' ? value.gearRedline : defaultDashColours.gearRedline
  return { theme, gearRedline, limits }
}
