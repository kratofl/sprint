import type { SprintState, TelemetryLinkState } from '../bridge'
import { deviceHasScreen, deviceImageKey, parseCatalog, parseDevices, toRecordArray } from './DevicesDomain'
import type { Device, DeviceImageKey } from './DevicesDomain'
import { parseDashLayouts } from './DashesDomain'
import { activePlan, parsePlans, targetsFor } from './SessionPlannerDomain'
import type { PlanStatus, SessionPlan } from './SessionPlannerDomain'

/**
 * Home domain: the Overview's own assembly of state already parsed elsewhere (devices, plans)
 * plus what nothing else on Home's surface parses yet — a screen's live hardware connection
 * state, the game link as a rig card, and the recent sessions with how the last one compares
 * to your earlier best on the same car and track.
 */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

// ── Screen hardware status (ScreenOutputHardware / ScreenModels.cs) ─────────
// Mirrors `HelpDiagnostics.ts`'s copy of the same host shape. `screens[].hardware` is not in
// bridge.ts's `SprintState.screens` type, so it is narrowed here, once, from `unknown` — kept
// as a small local copy rather than importing Help's domain file, the same way DevicesDomain.ts
// and DashesDomain.ts each keep their own hand-mirrored copy of the host shapes they read.

const SCREEN_CONNECTION_STATES = [
  'Disconnected',
  'Connecting',
  'Connected',
  'ConfigurationRequired',
  'PermissionDenied',
  'DeviceBusy',
  'DeviceConflict',
  'Unsupported',
  'Faulted',
] as const
type ScreenConnectionState = (typeof SCREEN_CONNECTION_STATES)[number]

const isScreenConnectionState = (value: unknown): value is ScreenConnectionState =>
  typeof value === 'string' && (SCREEN_CONNECTION_STATES as readonly string[]).includes(value)

function parseScreenConnectionState(screen: unknown): ScreenConnectionState | null {
  if (!isRecord(screen)) return null
  const hardware = screen.hardware
  if (!isRecord(hardware) || !isRecord(hardware.status) || !isScreenConnectionState(hardware.status.state)) return null
  return hardware.status.state
}

const SCREEN_STATUS_LABELS: Record<ScreenConnectionState, string> = {
  Disconnected: 'Disconnected',
  Connecting: 'Connecting',
  Connected: 'Connected',
  ConfigurationRequired: 'Configuration required',
  PermissionDenied: 'Permission denied',
  DeviceBusy: 'Device busy',
  DeviceConflict: 'Device conflict',
  Unsupported: 'Unsupported',
  Faulted: 'Faulted',
}

export type ScreenStatusTone = 'live' | 'attention' | 'idle' | 'fault'

function screenStatusTone(state: ScreenConnectionState): ScreenStatusTone {
  switch (state) {
    case 'Connected':
      return 'live'
    case 'Connecting':
    case 'ConfigurationRequired':
    case 'DeviceBusy':
      return 'attention'
    case 'Disconnected':
      return 'idle'
    case 'PermissionDenied':
    case 'DeviceConflict':
    case 'Unsupported':
    case 'Faulted':
      return 'fault'
  }
}

// ── Rig: the game link ───────────────────────────────────────────────────
// The game as the rig's first card. The sidebar's status row already says the whole sentence
// ("Le Mans Ultimate · 60 Hz"); the card splits it into a name and a short status word.

export type HomeGameTone = 'live' | 'attention' | 'idle' | 'fault'

export type HomeGame = { name: string; statusLabel: string; detail: string | null; tone: HomeGameTone }

const GAME_STATUS: Record<TelemetryLinkState, { label: string; tone: HomeGameTone }> = {
  Connected: { label: 'Live', tone: 'live' },
  Stale: { label: 'No fresh data', tone: 'attention' },
  Connecting: { label: 'Connecting', tone: 'attention' },
  WaitingForGame: { label: 'Not running', tone: 'idle' },
  Disconnected: { label: 'No telemetry source', tone: 'idle' },
  Unsupported: { label: 'Not supported here', tone: 'fault' },
  PermissionDenied: { label: 'No access', tone: 'fault' },
  Faulted: { label: 'Failed', tone: 'fault' },
}

export function homeGame(telemetry: SprintState['telemetry']): HomeGame {
  const { link, hz } = telemetry
  const status = GAME_STATUS[link.state]
  const rejected = link.state === 'Connected' && !link.lastFrameValid ? (link.invalidReason ?? 'Latest frame was rejected') : null
  return {
    name: link.sourceName || 'Game',
    statusLabel: status.label,
    detail: link.state === 'Connected' ? (rejected ?? `${Math.round(hz)} Hz`) : link.detail,
    tone: rejected ? 'attention' : status.tone,
  }
}

// ── Rig: screen devices ──────────────────────────────────────────────────
// Every saved, enabled, screen-capable device with its live hardware link. "Connected" means
// the link is actually up right now, not merely saved. Connected devices sort first; otherwise
// the saved order is kept.

export type HomeDevice = {
  device: Device
  image: DeviceImageKey | null
  dashName: string | null
  connected: boolean
  statusLabel: string
  statusTone: ScreenStatusTone
}

export function homeDevices(sprint: SprintState): HomeDevice[] {
  const dashes = parseDashLayouts(sprint.dashLayouts)
  const catalog = parseCatalog(toRecordArray(sprint.catalog))
  const result: HomeDevice[] = []
  for (const device of parseDevices(sprint.devices)) {
    if (device.disabled || !deviceHasScreen(device)) continue
    const screen = sprint.screens.find((candidate) => candidate.deviceId === device.id)
    const state = screen ? parseScreenConnectionState(screen) : null
    result.push({
      device,
      image: deviceImageKey(device, catalog),
      dashName: dashes.find((layout) => layout.id === device.dashId)?.name ?? null,
      connected: state === 'Connected',
      statusLabel: state ? SCREEN_STATUS_LABELS[state] : 'Not connected',
      statusTone: state ? screenStatusTone(state) : 'idle',
    })
  }

  return [...result.filter((entry) => entry.connected), ...result.filter((entry) => !entry.connected)]
}

// ── Session plans ────────────────────────────────────────────────────────
// "Open" is everything still ahead of or in progress for the driver, not yet completed or
// abandoned.

const CLOSED_PLAN_STATUSES: readonly PlanStatus[] = ['Completed', 'Abandoned']

export function openPlans(sprint: SprintState): SessionPlan[] {
  return parsePlans(sprint.plans).filter((plan) => !CLOSED_PLAN_STATUSES.includes(plan.status))
}

// ── Primary action + the plan card ───────────────────────────────────────
// The Overview's one accent command: jump into the plan that holds the active (armed/tracking)
// slot, or — with nothing armed — go plan a session. Without an active plan the card offers the
// newest draft instead.

export type OverviewPrimary = { kind: 'open-plan'; plan: SessionPlan } | { kind: 'plan-session'; draft: SessionPlan | null }

export function overviewPrimary(plans: readonly SessionPlan[]): OverviewPrimary {
  const active = activePlan(plans)
  return active ? { kind: 'open-plan', plan: active } : { kind: 'plan-session', draft: plans.find((plan) => plan.status === 'Draft') ?? null }
}

/** The four facts on the "Next up" card; times stay raw for the view to format. */
export type PlanFacts = { startsAt: string | null; raceLength: string | null; targetLapSeconds: number | null; fuelPerLapLiters: number | null }

export function planFacts(plan: SessionPlan): PlanFacts {
  const starts = plan.segments.map((segment) => segment.plannedStart).filter((start): start is string => start !== null)
  starts.sort((a, b) => Date.parse(a) - Date.parse(b))
  return {
    startsAt: starts[0] ?? null,
    raceLength: raceLength(plan),
    targetLapSeconds: targetsFor(plan, 'Race')?.lapTime?.lapTimeSeconds ?? plan.avgLapTimeSeconds,
    fuelPerLapLiters: plan.fuelPerLapLiters,
  }
}

/** "6 h", "1 h 30 min", "45 min" or "24 laps"; null when the plan has no race length yet. */
function raceLength(plan: SessionPlan): string | null {
  if (!(plan.raceLengthValue > 0)) return null
  switch (plan.raceLengthFormat) {
    case 'TimeBased': {
      const hours = Math.floor(plan.raceLengthValue / 60)
      const minutes = plan.raceLengthValue % 60
      return hours === 0 ? `${minutes} min` : minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
    }
    case 'LapBased':
      return `${plan.raceLengthValue} laps`
    case 'Unknown':
      return null
  }
}

// ── Recent sessions ──────────────────────────────────────────────────────
// `state.lapHistory` is the recorded/imported corpus (LapHistorySession[]). Each row is narrowed
// here just far enough for the list: what/where/when, the lap count and the best valid lap with
// its sectors. The newest session is also compared with your best on the same game, track and
// car from the sessions before it.

export type HomeSession = {
  id: string
  kind: string
  track: string
  car: string
  startedAt: string
  lapCount: number
  bestLapSeconds: number | null
  /** The best lap's sector times; empty when the game did not report them. */
  bestSectors: number[]
}

/** How the newest session's best lap compares with every earlier session on the same combo. */
export type LastSessionComparison = {
  /** Negative is faster, so a new personal best. Null when there is no earlier lap to compare with. */
  gapSeconds: number | null
  /** Per sector of the best lap, against your best earlier time in that sector; null where there is none. */
  sectorGaps: (number | null)[]
}

export type RecentSessions = { last: HomeSession; comparison: LastSessionComparison; earlier: HomeSession[] }

const SESSION_KIND_LABELS: Record<string, string> = { TestDay: 'Test day', Warmup: 'Warm-up', Unknown: 'Session' }

type ValidLap = { lapTimeSeconds: number; sectors: number[] }
type ParsedSession = { session: HomeSession; comboKey: string; laps: ValidLap[] }

function validLaps(value: unknown): ValidLap[] {
  if (!Array.isArray(value)) return []
  const laps: ValidLap[] = []
  for (const lap of value) {
    if (!isRecord(lap) || lap.isValid === false || typeof lap.lapTimeSeconds !== 'number' || !(lap.lapTimeSeconds > 0)) continue
    const sectors = Array.isArray(lap.sectorsSeconds) ? lap.sectorsSeconds.filter((item): item is number => typeof item === 'number' && item > 0) : []
    laps.push({ lapTimeSeconds: lap.lapTimeSeconds, sectors })
  }
  return laps
}

function parseHistorySession(row: Record<string, unknown>): ParsedSession | null {
  if (typeof row.id !== 'string' || typeof row.startedAt !== 'string' || Number.isNaN(Date.parse(row.startedAt))) return null
  const context = isRecord(row.context) ? row.context : {}
  const text = (value: unknown) => (typeof value === 'string' ? value : '')
  const kind = text(row.kind)
  const laps = validLaps(row.laps)
  let best: ValidLap | null = null
  for (const lap of laps) if (best === null || lap.lapTimeSeconds < best.lapTimeSeconds) best = lap
  const track = text(context.trackCourse)
  const car = text(context.carModel)
  return {
    session: {
      id: row.id,
      kind: SESSION_KIND_LABELS[kind] ?? (kind || 'Session'),
      track,
      car,
      startedAt: row.startedAt,
      lapCount: Array.isArray(row.laps) ? row.laps.length : 0,
      bestLapSeconds: best?.lapTimeSeconds ?? null,
      bestSectors: best?.sectors ?? [],
    },
    comboKey: JSON.stringify([text(context.game), track, car]),
    laps,
  }
}

/** The newest `limit` sessions, newest first; the first opened up with its comparison. Null with no sessions. */
export function recentSessions(sprint: SprintState, limit = 4): RecentSessions | null {
  const parsed = sprint.lapHistory
    .map(parseHistorySession)
    .filter((entry): entry is ParsedSession => entry !== null)
    .sort((a, b) => Date.parse(b.session.startedAt) - Date.parse(a.session.startedAt))
  const [newest, ...older] = parsed
  if (!newest) return null

  const earlierLaps = older.filter((entry) => entry.comboKey === newest.comboKey).flatMap((entry) => entry.laps)
  const fastest = (times: number[]): number | null => (times.length > 0 ? Math.min(...times) : null)
  const earlierBest = fastest(earlierLaps.map((lap) => lap.lapTimeSeconds))
  const best = newest.session.bestLapSeconds

  return {
    last: newest.session,
    comparison: {
      gapSeconds: best !== null && earlierBest !== null ? best - earlierBest : null,
      sectorGaps: newest.session.bestSectors.map((time, index) => {
        // Only laps split the same way compare sector by sector.
        const previous = fastest(earlierLaps.flatMap((lap) => (lap.sectors.length === newest.session.bestSectors.length ? lap.sectors.slice(index, index + 1) : [])))
        return previous === null ? null : time - previous
      }),
    },
    earlier: older.slice(0, limit - 1).map((entry) => entry.session),
  }
}
