import type { LiveSample } from './records'

// Telemetry samples as chart points, shared by the session page's history charts
// and the live view's rolling traces.

// One chart point. `t` is seconds from `origin` (negative before it); inputs are
// percentages so the axes read naturally. A gap point has null values, which
// breaks the line there instead of bridging missing data with a straight segment.
export type TracePoint = { t: number } & (
  | { speed: number; throttle: number; brake: number; gear: number; rpm: number }
  | { speed: null; throttle: null; brake: null; gear: null; rpm: null }
)

// Chart points for `samples`, oldest first. Where two samples are more than
// `maxGapMs` apart (the driver's desktop dropped off, say) a gap point goes
// between them. The default never breaks the line.
export function tracePoints(samples: readonly LiveSample[], origin: number, maxGapMs = Infinity): readonly TracePoint[] {
  const points: TracePoint[] = []
  let previous: number | null = null
  for (const sample of samples) {
    if (previous !== null && sample.timestamp - previous > maxGapMs) {
      points.push({ t: ((previous + sample.timestamp) / 2 - origin) / 1000, speed: null, throttle: null, brake: null, gear: null, rpm: null })
    }
    points.push({
      t: (sample.timestamp - origin) / 1000,
      speed: Math.round(sample.speedKph),
      throttle: Math.round(sample.throttle * 100),
      brake: Math.round(sample.brake * 100),
      gear: sample.gear,
      rpm: Math.round(sample.rpm),
    })
    previous = sample.timestamp
  }
  return points
}

// "1:05" or "1:02:05" for seconds since the start; "−0:12" for the past.
export function formatClock(seconds: number): string {
  const sign = seconds < 0 ? '−' : ''
  const total = Math.round(Math.abs(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${sign}${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${sign}${minutes}:${rest}`
}

// "R", "N" or the gear number.
export function formatGear(gear: number): string {
  return gear < 0 ? 'R' : gear === 0 ? 'N' : String(gear)
}
