// Pure value formatters for dash widgets, ported from the desktop client's
// `Features/Dashes/DashFormat.cs` (itself ported from the retired Go `widgets/format.go`).
// Kept dependency-free so every widget renderer formats telemetry the same way.

/**
 * Rounds to the nearest integer, breaking an exact `.5` tie toward the even neighbour —
 * matches .NET's `Math.Round(double)` default (`MidpointRounding.ToEven`), which the C#
 * dash bindings rely on for whole-number channels (rpm, speed, tyre surface temp).
 */
export function roundToEven(value: number): number {
  const floor = Math.floor(value)
  const diff = value - floor
  if (diff < 0.5) return floor
  if (diff > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}

/** Rounds to `decimals` places, breaking an exact tie away from zero (`MidpointRounding.AwayFromZero`). */
function roundAwayFromZero(value: number, decimals: number): number {
  const factor = 10 ** decimals
  const scaled = value * factor
  const rounded = value >= 0 ? Math.round(scaled) : -Math.round(-scaled)
  return rounded / factor
}

/** Lap/best/last time in seconds -> `m:ss.mmm`, or a placeholder when not set. */
export function formatLap(seconds: number): string {
  if (seconds <= 0 || !Number.isFinite(seconds)) {
    return '--:--.---'
  }

  // Round to whole milliseconds FIRST, then split — otherwise truncating minutes and
  // rounding the seconds remainder can yield ":60.000" for a value a fraction of a
  // millisecond below a whole minute.
  const totalMs = Math.round(seconds * 1000)
  const minutes = Math.floor(totalMs / 60_000)
  const secs = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

/** Signed lap delta in seconds -> `+0.000` / `-0.000` / `0.000` (3dp, dead-band rounded). */
export function formatDelta(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0.000'
  }

  const rounded = roundAwayFromZero(seconds, 3)
  if (Math.abs(rounded) < 0.001) {
    return '0.000'
  }

  return rounded > 0 ? `+${rounded.toFixed(3)}` : rounded.toFixed(3)
}

/** Speed in m/s -> integer km/h. */
export function formatSpeedKph(metersPerSecond: number): string {
  return String(roundToEven(metersPerSecond * 3.6))
}

/** Celsius -> up to one decimal place, trimming a trailing `.0`. */
export function formatTemp(celsius: number): string {
  const fixed = celsius.toFixed(1)
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
}

/** Gear index -> driver-facing glyph (N neutral, R reverse, otherwise the number). */
export function formatGear(gear: number): string {
  if (gear === 0) return 'N'
  if (gear < 0) return 'R'
  return String(gear)
}

/** Truncates toward zero, matching a C# `(long)` cast. */
export function formatInt(value: number): string {
  return String(Math.trunc(value))
}

/** Time gap in seconds -> `0.000`, or `--` when there is no car (non-positive/NaN). */
export function formatGap(seconds: number): string {
  if (seconds <= 0 || !Number.isFinite(seconds)) {
    return '--'
  }

  return seconds.toFixed(3)
}

/** Tyre pressure in kPa -> one decimal place, or `--` when not reported. */
export function formatPressure(kPa: number): string {
  if (kPa <= 0 || !Number.isFinite(kPa)) {
    return '--'
  }

  return kPa.toFixed(1)
}

export function formatFuel(liters: number): string {
  return liters.toFixed(1)
}

export function formatFuelPerLap(liters: number): string {
  return liters.toFixed(2)
}

/**
 * A planned fuel figure -> `0.00`, or `--` when nothing was planned. Absent is its own
 * state here rather than a zero: `0.00 L/lap` is a target no car can hit, and reading it
 * as one would send a driver looking for a plan they never made.
 */
export function formatFuelPerLapTarget(liters: number | null): string {
  return liters !== null && Number.isFinite(liters) ? formatFuelPerLap(liters) : '--'
}
