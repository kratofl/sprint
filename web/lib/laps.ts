import type { LiveLap } from './records'

// Laps of one session for its detail page, and how lap times read.

// One lap as the session page lists it. `sectors` and `topSpeedKph` only come
// with a synced lap history.
export type SessionLap = { lap: number; time: number; valid: boolean; sectors: readonly number[]; topSpeedKph: number | null }

// The session's laps, by lap number. The desktop's synced lap history (`data`, the
// LapHistorySession JSON) is the record and knows sectors; until it has synced,
// the laps the API detected in the live stream stand in. Malformed history entries
// are skipped.
export function sessionLaps(data: string, streamed: readonly LiveLap[]): readonly SessionLap[] {
  const synced = syncedLaps(data)
  const laps =
    synced.length > 0
      ? synced
      : streamed.map((lap) => ({ lap: lap.lap, time: lap.lapTime, valid: lap.valid, sectors: [], topSpeedKph: null }))
  return [...laps].sort((a, b) => a.lap - b.lap)
}

function syncedLaps(data: string): SessionLap[] {
  let body: unknown
  try {
    body = JSON.parse(data)
  } catch {
    return []
  }
  if (!isRecord(body) || !Array.isArray(body.laps)) return []
  return body.laps.flatMap((entry: unknown): SessionLap[] => {
    if (!isRecord(entry) || !isNumber(entry.lapNumber) || !isNumber(entry.lapTimeSeconds)) return []
    return [
      {
        lap: entry.lapNumber,
        time: entry.lapTimeSeconds,
        valid: entry.isValid !== false,
        sectors: Array.isArray(entry.sectorsSeconds) ? entry.sectorsSeconds.filter(isNumber) : [],
        topSpeedKph: isNumber(entry.topSpeedKph) ? entry.topSpeedKph : null,
      },
    ]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// "1:32.481"; "—" when there is no time (the sims report 0 or less for none).
export function formatLapTime(seconds: number): string {
  if (!(seconds > 0)) return '—'
  const millis = Math.round(seconds * 1000)
  const minutes = Math.floor(millis / 60_000)
  const rest = (millis % 60_000) / 1000
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`
}

// A signed gap in seconds: "+0.314", "−1.200", "±0.000".
export function formatDelta(seconds: number): string {
  const magnitude = Math.abs(seconds).toFixed(3)
  if (magnitude === '0.000') return '±0.000'
  return `${seconds > 0 ? '+' : '−'}${magnitude}`
}

// The session page's headline figures. `bestTime` is the fastest valid lap; the
// top speed is the higher of the lap history's and the recorded telemetry's;
// the duration is the span of the recorded telemetry.
export type SessionSummary = {
  bestLap: number | null
  bestTime: number | null
  laps: number
  validLaps: number
  topSpeedKph: number | null
  durationSeconds: number | null
}

export function sessionSummary(laps: readonly SessionLap[], samples: readonly { timestamp: number; speedKph: number }[]): SessionSummary {
  const valid = laps.filter((lap) => lap.valid && lap.time > 0)
  const best = valid.reduce<SessionLap | null>((fastest, lap) => (fastest === null || lap.time < fastest.time ? lap : fastest), null)
  const speeds = [...laps.flatMap((lap) => (lap.topSpeedKph === null ? [] : [lap.topSpeedKph])), ...samples.map((sample) => sample.speedKph)]
  return {
    bestLap: best?.lap ?? null,
    bestTime: best?.time ?? null,
    laps: laps.length,
    validLaps: valid.length,
    topSpeedKph: speeds.length > 0 ? Math.max(...speeds) : null,
    durationSeconds: samples.length > 1 ? (samples[samples.length - 1].timestamp - samples[0].timestamp) / 1000 : null,
  }
}
