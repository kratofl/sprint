import type { SprintState } from '../bridge'
import { deviceHasScreen, parseDevices } from './DevicesDomain'
import type { Device } from './DevicesDomain'
import { layoutScreenProfile, parseDashLayouts } from './DashesDomain'
import type { DashLayout } from '@sprint/dashboard'
import { activePlan, parsePlans } from './SessionPlannerDomain'
import type { PlanStatus, SessionPlan } from './SessionPlannerDomain'

/**
 * Home domain: the Overview's own assembly of state already parsed elsewhere
 * (devices, dash layouts, plans) plus the two things nothing else on Home's
 * surface parses yet — a screen's live hardware connection state and the size
 * of the recorded lap history.
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

// ── Screen devices ───────────────────────────────────────────────────────
// Every saved, enabled, screen-capable device with its live hardware link. "Connected" means
// the same thing the retired Avalonia launchpad meant by it: the link is actually up right
// now, not merely saved. Connected devices sort first; otherwise the saved order is kept.

export type HomeDevice = {
  device: Device
  dashName: string | null
  connected: boolean
  statusLabel: string
  statusTone: ScreenStatusTone
}

export function homeDevices(sprint: SprintState): HomeDevice[] {
  const dashes = parseDashLayouts(sprint.dashLayouts)
  const result: HomeDevice[] = []
  for (const device of parseDevices(sprint.devices)) {
    if (device.disabled || !deviceHasScreen(device)) continue
    const screen = sprint.screens.find((candidate) => candidate.deviceId === device.id)
    const state = screen ? parseScreenConnectionState(screen) : null
    result.push({
      device,
      dashName: dashes.find((layout) => layout.id === device.dashId)?.name ?? null,
      connected: state === 'Connected',
      statusLabel: state ? SCREEN_STATUS_LABELS[state] : 'Not connected',
      statusTone: state ? screenStatusTone(state) : 'idle',
    })
  }

  return [...result.filter((entry) => entry.connected), ...result.filter((entry) => !entry.connected)]
}

// ── Dashes ───────────────────────────────────────────────────────────────

export type HomeDash = { layout: DashLayout; profileLabel: string; assignedDeviceNames: string[] }

export function homeDashes(sprint: SprintState): HomeDash[] {
  const devices = parseDevices(sprint.devices).filter((device) => !device.disabled && deviceHasScreen(device))
  return parseDashLayouts(sprint.dashLayouts).map((layout) => {
    const profile = layoutScreenProfile(layout)
    return {
      layout,
      profileLabel: profile.name,
      assignedDeviceNames: devices.filter((device) => device.dashId === layout.id).map((device) => device.name),
    }
  })
}

// ── Session plans ────────────────────────────────────────────────────────
// "Open" mirrors the retired launchpad's `_plannerController.OpenPlans`: everything still
// ahead of or in progress for the driver, not yet completed or abandoned.

const CLOSED_PLAN_STATUSES: readonly PlanStatus[] = ['Completed', 'Abandoned']

export function openPlans(sprint: SprintState): SessionPlan[] {
  return parsePlans(sprint.plans).filter((plan) => !CLOSED_PLAN_STATUSES.includes(plan.status))
}

// ── Primary action ───────────────────────────────────────────────────────
// The Overview's one accent command: jump into the plan that holds the active
// (armed/tracking) slot, or — with nothing armed — go plan a session.

export type OverviewPrimary = { kind: 'open-plan'; plan: SessionPlan } | { kind: 'plan-session' }

export function overviewPrimary(plans: readonly SessionPlan[]): OverviewPrimary {
  const active = activePlan(plans)
  return active ? { kind: 'open-plan', plan: active } : { kind: 'plan-session' }
}

// ── Lap history ──────────────────────────────────────────────────────────
// `state.lapHistory` is the full recorded/imported corpus (LapHistorySession[]). Home only
// counts it, so each row is narrowed just far enough to count sessions and their laps.

export type HistorySummary = { sessions: number; laps: number }

export function lapHistorySummary(sprint: SprintState): HistorySummary {
  let sessions = 0
  let laps = 0
  for (const row of sprint.lapHistory) {
    if (typeof row.id !== 'string') continue
    sessions += 1
    laps += Array.isArray(row.laps) ? row.laps.length : 0
  }

  return { sessions, laps }
}
