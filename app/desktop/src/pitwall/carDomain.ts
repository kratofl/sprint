import type { CarDamage, PitWallTrace, TyrePressures } from './pitWallData'

// The car, worked out for the tyre, pressure, damage and traces tiles. Pure.

export type Heat = 'cold' | 'ok' | 'warm' | 'hot'

/** A tyre surface or core temperature (°C) in the four bands the tyre drawing colours. */
export const tyreHeat = (celsius: number): Heat => (celsius < 80 ? 'cold' : celsius < 93 ? 'ok' : celsius < 99 ? 'warm' : 'hot')

/** A brake disc temperature (°C): cold, in its window, or hot. */
export const brakeHeat = (celsius: number): Exclude<Heat, 'warm'> => (celsius < 350 ? 'cold' : celsius < 720 ? 'ok' : 'hot')

/** The band the pressure chart shades as the target, kPa. */
export const PRESSURE_TARGET = { low: 168, high: 172 } as const

/** The pressure chart's value range: the data and the target band, a little padded, in whole kPa. */
export function pressureRange(pressures: readonly TyrePressures[]): { min: number; max: number } {
  const values = pressures.flatMap((row) => [row.fl, row.fr, row.rl, row.rr]).filter((value) => value > 0)
  const min = Math.floor(Math.min(PRESSURE_TARGET.low, ...values) - 2)
  const max = Math.ceil(Math.max(PRESSURE_TARGET.high, ...values) + 2)
  return { min, max }
}

/** Ticks for a range: every `step` kPa from the first multiple inside it. */
export const ticksIn = (range: { min: number; max: number }, step: number): number[] => {
  const ticks: number[] = []
  for (let value = Math.ceil(range.min / step) * step; value <= range.max; value += step) ticks.push(value)
  return ticks
}

/** The eight dent zones round the car, in LMU's `mDentSeverity` order (assumed clockwise from front left). */
export const DENT_ZONES = ['frontLeft', 'front', 'frontRight', 'right', 'rearRight', 'rear', 'rearLeft', 'left'] as const
export type DentZone = (typeof DENT_ZONES)[number]

export type DamageRow = { label: string; severity: 0 | 1 | 2; word: string }

const SEVERITY_WORD = ['OK', 'Light damage', 'Heavy damage'] as const
const severity = (value: number | undefined): 0 | 1 | 2 => (value === undefined || value <= 0 ? 0 : value >= 2 ? 2 : 1)

export const dentOf = (damage: CarDamage, zone: DentZone): 0 | 1 | 2 => severity(damage.dents[DENT_ZONES.indexOf(zone)])

/** What the damage list says: the bodywork by side, then parts and the engine. */
export function damageRows(damage: CarDamage): DamageRow[] {
  const worst = (...zones: DentZone[]) => zones.map((zone) => dentOf(damage, zone)).reduce<0 | 1 | 2>((most, level) => (level > most ? level : most), 0)
  const body = (label: string, level: 0 | 1 | 2): DamageRow => ({ label, severity: level, word: SEVERITY_WORD[level] })
  return [
    body('Front bodywork', worst('frontLeft', 'front', 'frontRight')),
    body('Left side', worst('left')),
    body('Right side', worst('right')),
    body('Rear bodywork', worst('rearLeft', 'rear', 'rearRight')),
    { label: 'Parts', severity: damage.detachedParts ? 2 : 0, word: damage.detachedParts ? 'A part came off' : 'All on' },
    { label: 'Engine', severity: damage.overheating ? 2 : 0, word: damage.overheating ? 'Overheating' : 'OK' },
  ]
}

/** The zone a pin marks as hit: the worst dent (the first of equals), or null with none. */
export function worstZone(damage: CarDamage): DentZone | null {
  let found: DentZone | null = null
  let level = 0
  for (const zone of DENT_ZONES) {
    const value = dentOf(damage, zone)
    if (value > level) {
      level = value
      found = zone
    }
  }
  return found
}

/**
 * Seconds from the start of the lap to each trace point, from speed over distance: the trace has
 * no clock of its own. Null without a track length.
 */
export function traceTimes(trace: PitWallTrace, trackLengthMeters: number | null): number[] | null {
  if (trackLengthMeters === null || trackLengthMeters <= 0 || trace.distance.length === 0) return null
  const times = [0]
  for (let index = 1; index < trace.distance.length; index++) {
    const meters = (trace.distance[index] - trace.distance[index - 1]) * trackLengthMeters
    const speed = Math.max(5, (trace.speed[index] + trace.speed[index - 1]) / 2) / 3.6
    times.push(times[index - 1] + Math.max(0, meters) / speed)
  }
  // The first point is where the trace starts, not the line: count from distance 0.
  const lead = (trace.distance[0] * trackLengthMeters) / (Math.max(5, trace.speed[0]) / 3.6)
  return times.map((time) => time + lead)
}

/** The time at `distance` along a trace, linearly between its points; null outside it. */
function timeAt(trace: PitWallTrace, times: readonly number[], distance: number): number | null {
  const points = trace.distance
  if (points.length === 0 || distance < points[0] || distance > points[points.length - 1]) return null
  let low = 0
  let high = points.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (points[middle] <= distance) low = middle
    else high = middle
  }
  const span = points[high] - points[low]
  const t = span > 0 ? (distance - points[low]) / span : 0
  return times[low] + (times[high] - times[low]) * t
}

/**
 * The live gap to the target at the end of the lap being driven: the current lap's time to its
 * newest point against the target's time to the same place. Negative is ahead. Null when either
 * trace is missing or too short.
 */
export function liveDelta(current: PitWallTrace, target: PitWallTrace, trackLengthMeters: number | null): number | null {
  if (current.distance.length < 2 || target.distance.length < 2) return null
  const currentTimes = traceTimes(current, trackLengthMeters)
  const targetTimes = traceTimes(target, trackLengthMeters)
  if (!currentTimes || !targetTimes) return null
  const at = current.distance[current.distance.length - 1]
  const theirs = timeAt(target, targetTimes, at)
  return theirs === null ? null : currentTimes[currentTimes.length - 1] - theirs
}

export type TraceChannel = 'speed' | 'throttle' | 'brake' | 'steering'
export const TRACE_CHANNELS: readonly { channel: TraceChannel; label: string }[] = [
  { channel: 'speed', label: 'Speed' },
  { channel: 'throttle', label: 'Throttle' },
  { channel: 'brake', label: 'Brake' },
  { channel: 'steering', label: 'Steering' },
]

/** A channel's values as 0..1 of its row (1 at the top): speed against its own top, steering centred. */
export function channelLevels(trace: PitWallTrace, channel: TraceChannel, speedTop: number): number[] {
  switch (channel) {
    case 'speed':
      return trace.speed.map((value) => Math.min(1, Math.max(0, value / speedTop)))
    case 'throttle':
      return trace.throttle.map((value) => Math.min(1, Math.max(0, value)))
    case 'brake':
      return trace.brake.map((value) => Math.min(1, Math.max(0, value)))
    case 'steering':
      return trace.steering.map((value) => Math.min(1, Math.max(0, (value + 1) / 2)))
  }
}

/** The top of the speed row: the fastest point of either trace, rounded up to 20 km/h. */
export const speedTop = (...traces: readonly PitWallTrace[]): number =>
  Math.max(100, Math.ceil(Math.max(0, ...traces.flatMap((trace) => trace.speed)) / 20) * 20)
