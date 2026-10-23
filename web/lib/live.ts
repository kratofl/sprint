import type { LiveLap, LiveSample, LiveSession } from './records'

// The live session view's model: the events the stream delivers, how they are
// parsed from the wire, and the reducer the view renders from. Pure, so the
// states the viewer can end up in (live, reconnecting, ended, revoked) are tested
// without a browser. The stream is the API's SSE (docs/internals/live-telemetry.md),
// bridged by app/api/live/[sessionKey]/route.ts, which adds `unavailable` when the
// API refuses the stream.

// Why the web's stream bridge could not open the API's stream.
export type UnavailableStatus = 'not-live' | 'forbidden' | 'signed-out' | 'error'

// One server event, parsed.
export type LiveEvent =
  // `recent` is the last 30 s of samples, oldest first, so a late viewer's trace starts full.
  | { type: 'snapshot'; session: LiveSession; latest: LiveSample | null; recent: readonly LiveSample[]; laps: readonly LiveLap[] }
  | { type: 'samples'; samples: readonly LiveSample[] }
  | { type: 'lap'; lap: LiveLap }
  | { type: 'ended'; reason: string }
  | { type: 'revoked'; reason: string }
  | { type: 'unavailable'; status: UnavailableStatus; reason: string }

// What the browser's EventSource reports on its own: the connection dropped and it
// is retrying, it gave up for good, or no sample arrived for a while.
export type ConnectionEvent = { type: 'connection-lost' } | { type: 'connection-closed' } | { type: 'stale' }

export type LiveAction = LiveEvent | ConnectionEvent

// Where the stream stands. Only `connecting`, `live` and `reconnecting` take more events.
export type LiveStatus =
  | { kind: 'connecting' }
  | { kind: 'live' }
  | { kind: 'reconnecting' }
  | { kind: 'ended'; reason: string }
  | { kind: 'revoked'; reason: string }
  | { kind: 'signed-out' }
  | { kind: 'failed'; reason: string }

export type LiveState = {
  status: LiveStatus
  session: LiveSession | null
  // The newest readout.
  latest: LiveSample | null
  // The last TRACE_WINDOW_MS of samples, oldest first, for the rolling traces.
  trace: readonly LiveSample[]
  laps: readonly LiveLap[]
  // Whether samples are arriving; false while the driver's desktop is disconnected.
  receiving: boolean
}

// How much of the recent past the rolling traces show.
export const TRACE_WINDOW_MS = 30_000

// The rolling traces break their line where samples are further apart than this.
// The desktop sends up to 20 Hz, so a second without one is missing data.
export const TRACE_GAP_MS = 1_000

// After this long without a sample the view says it is waiting for data.
export const STALE_AFTER_MS = 5_000

export const initialLiveState: LiveState = { status: { kind: 'connecting' }, session: null, latest: null, trace: [], laps: [], receiving: false }

// Applies one event. Terminal states (ended, revoked, signed-out, failed) ignore
// everything after them.
export function liveReducer(state: LiveState, action: LiveAction): LiveState {
  if (!isOpen(state.status)) return state
  switch (action.type) {
    case 'snapshot': {
      // `recent` ends with `latest`; an API that sends no `recent` still gives the latest.
      const seed = action.recent.length > 0 || action.latest === null ? action.recent : [action.latest]
      const trace = appendSamples(state.trace, seed)
      return {
        status: { kind: 'live' },
        session: action.session,
        latest: action.latest ?? state.latest,
        trace,
        laps: action.laps,
        receiving: action.session.connected && action.latest !== null,
      }
    }
    case 'samples': {
      if (action.samples.length === 0) return state
      return { ...state, latest: action.samples[action.samples.length - 1], trace: appendSamples(state.trace, action.samples), receiving: true }
    }
    case 'lap':
      return state.laps.some((lap) => lap.lap === action.lap.lap) ? state : { ...state, laps: [...state.laps, action.lap] }
    case 'ended':
      return { ...state, status: { kind: 'ended', reason: action.reason }, receiving: false }
    case 'revoked':
      return { ...initialLiveState, status: { kind: 'revoked', reason: action.reason } }
    case 'unavailable':
      return refused(state, action.status, action.reason)
    case 'connection-lost':
      return { ...state, status: { kind: 'reconnecting' }, receiving: false }
    case 'connection-closed':
      return { ...state, status: { kind: 'failed', reason: 'The live connection closed. Reload the page to try again.' }, receiving: false }
    case 'stale':
      return { ...state, receiving: false }
  }
}

// The bridge could not open the API's stream. Only a server error is worth the
// EventSource's automatic retry; the view closes the stream for the rest.
function refused(state: LiveState, status: UnavailableStatus, reason: string): LiveState {
  switch (status) {
    case 'not-live':
      return { ...state, status: { kind: 'ended', reason }, receiving: false }
    case 'forbidden':
      return { ...initialLiveState, status: { kind: 'revoked', reason } }
    case 'signed-out':
      return { ...initialLiveState, status: { kind: 'signed-out' } }
    case 'error':
      return { ...state, status: { kind: 'reconnecting' }, receiving: false }
  }
}

// Whether the view should close its EventSource after this event. Everything but a
// server error is final; the browser would otherwise reconnect on its own.
export function endsStream(event: LiveEvent): boolean {
  return event.type === 'ended' || event.type === 'revoked' || (event.type === 'unavailable' && event.status !== 'error')
}

// Whether the stream may still deliver events.
export function isOpen(status: LiveStatus): boolean {
  return status.kind === 'connecting' || status.kind === 'live' || status.kind === 'reconnecting'
}

// Adds samples newer than the trace's last one and drops what fell out of the window.
// Gaps stay gaps: tracePoints breaks the line where samples are TRACE_GAP_MS apart.
function appendSamples(trace: readonly LiveSample[], samples: readonly LiveSample[]): readonly LiveSample[] {
  const last = trace.length > 0 ? trace[trace.length - 1].timestamp : -Infinity
  const fresh = samples.filter((sample) => sample.timestamp > last)
  if (fresh.length === 0) return trace
  const merged = [...trace, ...fresh]
  const cutoff = merged[merged.length - 1].timestamp - TRACE_WINDOW_MS
  return merged.filter((sample) => sample.timestamp >= cutoff)
}

// What the web's stream bridge tells the viewer when the API refuses the stream.
// `status` is the API's HTTP status, or null when it could not be reached.
export function upstreamFailure(status: number | null): { status: UnavailableStatus; reason: string } {
  switch (status) {
    case 404:
      return { status: 'not-live', reason: 'This session is not live right now.' }
    case 403:
      return { status: 'forbidden', reason: 'You don’t have access to this session.' }
    case 401:
      return { status: 'signed-out', reason: 'Your sign-in expired.' }
    default:
      return { status: 'error', reason: 'Can’t reach the Sprint API.' }
  }
}

// Parses one SSE event (its name and data line). Null for anything malformed or
// unknown, so a bad event is skipped whole instead of half-applied.
export function parseLiveEvent(name: string, data: string): LiveEvent | null {
  let body: unknown
  try {
    body = JSON.parse(data)
  } catch {
    return null
  }
  try {
    const value = record(body)
    switch (name) {
      case 'snapshot':
        return {
          type: 'snapshot',
          session: parseSession(value.session),
          latest: value.latest === null ? null : parseSample(value.latest),
          // An API older than the web sends no `recent`.
          recent: value.recent === undefined ? [] : list(value.recent).map(parseSample),
          laps: list(value.laps).map(parseLap),
        }
      case 'samples':
        return { type: 'samples', samples: list(value.samples).map(parseSample) }
      case 'lap':
        return { type: 'lap', lap: parseLap(value.lap) }
      case 'ended':
        return { type: 'ended', reason: string(value.reason) }
      case 'revoked':
        return { type: 'revoked', reason: string(value.reason) }
      case 'unavailable':
        return { type: 'unavailable', status: unavailableStatus(value.status), reason: string(value.reason) }
      default:
        return null
    }
  } catch (error) {
    if (error instanceof Malformed) return null
    throw error
  }
}

// Thrown by the readers below; parseLiveEvent turns it into null.
class Malformed extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Malformed()
  return Object.fromEntries(Object.entries(value))
}

function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Malformed()
  return value
}

function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Malformed()
  return value
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Malformed()
  return value
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Malformed()
  return value
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value)
}

function unavailableStatus(value: unknown): UnavailableStatus {
  switch (value) {
    case 'not-live':
    case 'forbidden':
    case 'signed-out':
    case 'error':
      return value
    default:
      throw new Malformed()
  }
}

function parseSession(value: unknown): LiveSession {
  const session = record(value)
  const driver = record(session.driver)
  return {
    sessionId: string(session.sessionId),
    sessionKey: string(session.sessionKey),
    driver: { id: string(driver.id), displayName: string(driver.displayName), avatarUrl: nullableString(driver.avatarUrl) },
    game: string(session.game),
    track: string(session.track),
    car: string(session.car),
    sessionType: string(session.sessionType),
    startedAt: string(session.startedAt),
    connected: boolean(session.connected),
  }
}

function parseLap(value: unknown): LiveLap {
  const lap = record(value)
  return { lap: number(lap.lap), lapTime: number(lap.lapTime), valid: boolean(lap.valid), completedAt: number(lap.completedAt) }
}

function parseSample(value: unknown): LiveSample {
  const sample = record(value)
  return {
    timestamp: number(sample.timestamp),
    lap: number(sample.lap),
    sector: number(sample.sector),
    currentLapTime: number(sample.currentLapTime),
    lastLapTime: number(sample.lastLapTime),
    bestLapTime: number(sample.bestLapTime),
    delta: number(sample.delta),
    lapValid: boolean(sample.lapValid),
    position: number(sample.position),
    speedKph: number(sample.speedKph),
    rpm: number(sample.rpm),
    maxRpm: number(sample.maxRpm),
    gear: number(sample.gear),
    throttle: number(sample.throttle),
    brake: number(sample.brake),
    steering: number(sample.steering),
    fuel: number(sample.fuel),
    trackPosition: number(sample.trackPosition),
    tyreTempFl: number(sample.tyreTempFl),
    tyreTempFr: number(sample.tyreTempFr),
    tyreTempRl: number(sample.tyreTempRl),
    tyreTempRr: number(sample.tyreTempRr),
    tyreWearFl: number(sample.tyreWearFl),
    tyreWearFr: number(sample.tyreWearFr),
    tyreWearRl: number(sample.tyreWearRl),
    tyreWearRr: number(sample.tyreWearRr),
  }
}

// The SSE frame the stream bridge writes for its own `unavailable` event.
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}
