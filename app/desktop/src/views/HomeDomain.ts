import type { SprintState, TelemetryLinkState } from '../bridge'
import { parseCarMarks, type CarMarks } from '../carMarks'
import { describeDeviceStatus, deviceHasScreen, deviceImageKey, findScreen, parseCatalog, parseDevices, parseScreens, toRecordArray } from './DevicesDomain'
import type { Device, DeviceImageKey, ScreenStatusPresentation } from './DevicesDomain'
import { parseDashLayouts } from './DashesDomain'
import { activePlan, parsePlans, targetsFor } from './SessionPlannerDomain'
import type { PlanStatus, SessionPlan } from './SessionPlannerDomain'

/**
 * Home domain: the Overview's own assembly of state already parsed elsewhere (devices and their
 * links, plans) plus what nothing else on Home's surface parses yet — the game link as a rig card,
 * and the recent sessions with how the last one compares to your earlier best on the same car and
 * track.
 */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

// ── Rig: the game link ───────────────────────────────────────────────────
// The game as the rig's first card. The status bar's game link already says the whole sentence
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
// Every saved, enabled, screen-capable device with its live hardware link, in the Devices page's
// words (`describeDeviceStatus`), so the Overview, Help, the status bar and Devices never disagree.
// "Connected" means the link is actually up right now, not merely saved. Connected devices sort
// first; otherwise the saved order is kept.

export type HomeDevice = {
  device: Device
  image: DeviceImageKey | null
  dashName: string | null
  connected: boolean
  status: ScreenStatusPresentation
}

export function homeDevices(sprint: SprintState): HomeDevice[] {
  const dashes = parseDashLayouts(sprint.dashLayouts)
  const catalog = parseCatalog(toRecordArray(sprint.catalog))
  const screens = parseScreens(sprint.screens)
  const result: HomeDevice[] = []
  for (const device of parseDevices(sprint.devices)) {
    if (device.disabled || !deviceHasScreen(device)) continue
    const screen = findScreen(screens, device.id)
    result.push({
      device,
      image: deviceImageKey(device, catalog),
      dashName: dashes.find((layout) => layout.id === device.dashId)?.name ?? null,
      connected: screen?.hardware?.status.state === 'Connected',
      status: describeDeviceStatus(device, screen),
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
// Built on the host from the lap-history corpus (`RecentSessions` in Core), so the corpus never
// travels in the polled state. Narrowed here; only the kind's label is decided on this side.

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
  /** How its car and track are shown. */
  marks: CarMarks
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

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

function parseRecentSession(value: unknown): HomeSession | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.startedAt !== 'string' || Number.isNaN(Date.parse(value.startedAt))) return null
  const text = (field: unknown) => (typeof field === 'string' ? field : '')
  const kind = text(value.kind)
  return {
    id: value.id,
    kind: SESSION_KIND_LABELS[kind] ?? (kind || 'Session'),
    track: text(value.track),
    car: text(value.car),
    startedAt: value.startedAt,
    lapCount: typeof value.lapCount === 'number' && Number.isInteger(value.lapCount) ? value.lapCount : 0,
    bestLapSeconds: numberOrNull(value.bestLapSeconds),
    bestSectors: Array.isArray(value.bestSectors) ? value.bestSectors.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : [],
    marks: parseCarMarks(value.marks, text(value.car)),
  }
}

/** The host's recent sessions, newest first; the first opened up with its comparison. Null with no sessions. */
export function recentSessions(sprint: SprintState): RecentSessions | null {
  const value = sprint.recentSessions
  if (!isRecord(value)) return null
  const last = parseRecentSession(value.last)
  if (!last) return null
  const comparison = isRecord(value.comparison) ? value.comparison : {}
  return {
    last,
    comparison: {
      gapSeconds: numberOrNull(comparison.gapSeconds),
      sectorGaps: Array.isArray(comparison.sectorGaps) ? comparison.sectorGaps.map(numberOrNull) : [],
    },
    earlier: Array.isArray(value.earlier) ? value.earlier.map(parseRecentSession).filter((entry): entry is HomeSession => entry !== null) : [],
  }
}
