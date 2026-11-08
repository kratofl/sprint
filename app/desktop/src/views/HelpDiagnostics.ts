/**
 * Diagnostics domain for the Help view: the log viewer, and what a screen's connection state
 * means for the driver (the Checks list's fix line).
 *
 * `sprint.diagnostics` and the array `bridge.diagnosticsLogs` resolves to are
 * not part of the typed `SprintState`/`SprintBridge` contracts in bridge.ts
 * (out of this view's file ownership), so both boundaries are narrowed here,
 * once, from `unknown` rather than trusted or cast.
 */

/** Mirrors Sprint.Desktop.Core's `LogLevel` enum, least to most severe. */
export const LOG_LEVELS = ['Debug', 'Info', 'Warn', 'Error', 'Fatal'] as const
export type LogLevelName = (typeof LOG_LEVELS)[number]

export const isLogLevelName = (value: unknown): value is LogLevelName =>
  typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)

export type LogEntry = {
  timestamp: string
  level: LogLevelName
  message: string
  exception: string | null
}

/** `state.diagnostics`: the host's current capture level and log directory. */
export type DiagnosticsInfo = {
  logLevel: LogLevelName
  directory: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const parseDiagnosticsInfo = (sprint: unknown): DiagnosticsInfo | null => {
  if (!isRecord(sprint) || !isRecord(sprint.diagnostics)) return null
  const { logLevel, directory } = sprint.diagnostics
  if (!isLogLevelName(logLevel) || typeof directory !== 'string') return null
  return { logLevel, directory }
}

const parseLogEntry = (value: unknown): LogEntry | null => {
  if (!isRecord(value)) return null
  const { timestamp, level, message, exception } = value
  if (typeof timestamp !== 'string' || !isLogLevelName(level) || typeof message !== 'string') return null
  return { timestamp, level, message, exception: typeof exception === 'string' ? exception : null }
}

/** `bridge.diagnosticsLogs` resolves to `unknown`; narrow the array boundary once, here. */
export const parseLogEntries = (value: unknown): LogEntry[] =>
  Array.isArray(value) ? value.map(parseLogEntry).filter((entry): entry is LogEntry => entry !== null) : []

/**
 * Mirrors `ScreenConnectionState` (`Sprint.Desktop.Core/Features/Hardware/ScreenModels.cs`),
 * which crosses the wire as its member name (the host's JSON options use a global
 * `JsonStringEnumConverter`).
 */
export const SCREEN_CONNECTION_STATES = [
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
export type ScreenConnectionState = (typeof SCREEN_CONNECTION_STATES)[number]

const isScreenConnectionState = (value: unknown): value is ScreenConnectionState =>
  typeof value === 'string' && (SCREEN_CONNECTION_STATES as readonly string[]).includes(value)

export type ScreenStatus = { state: ScreenConnectionState; detail: string | null }

/**
 * `ScreenOutputDescription` (`ScreenOutputs.cs`) has no top-level `status` field — a screen's
 * connection state lives at `hardware.status.state`, and `hardware` itself is not in bridge.ts's
 * `SprintState.screens` type. Narrowed here, once, from `unknown` rather than trusted.
 */
export const parseScreenStatus = (screen: unknown): ScreenStatus | null => {
  if (!isRecord(screen)) return null
  const hardware = screen.hardware
  if (!isRecord(hardware) || !isRecord(hardware.status) || !isScreenConnectionState(hardware.status.state)) return null
  const { state, detail } = hardware.status
  return { state, detail: typeof detail === 'string' ? detail : null }
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

export const screenStatusLabel = (state: ScreenConnectionState): string => SCREEN_STATUS_LABELS[state]

/** Same tone vocabulary as `describeTelemetry` (shell/telemetry.ts), applied to a screen's own hardware link. */
export type ScreenStatusTone = 'live' | 'attention' | 'idle' | 'fault'

export const screenStatusTone = (state: ScreenConnectionState): ScreenStatusTone => {
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

const SCREEN_HINTS: Record<ScreenConnectionState, string | null> = {
  Connected: null,
  Connecting: null,
  Disconnected: 'Not on USB. Plug it in, or turn it off on its device page so Sprint stops looking.',
  ConfigurationRequired: 'Its settings need a look on its device page.',
  PermissionDenied: 'Windows refused access. Close other apps that use it, then plug it back in.',
  DeviceBusy: 'Another app is using it. Close that app and Sprint takes over.',
  DeviceConflict: 'Two devices claim this screen. Check them on the Devices page.',
  Unsupported: 'This screen can’t be driven on this computer.',
  Faulted: 'It stopped answering. Unplug it and plug it back in.',
}

/**
 * What to do about a screen that is not connected, for the Checks list. Unplugged (or never
 * reported) always reads as the plain sentence: the host's reason there is a USB match message,
 * which the logs keep. Other problems prefer the host's own reason, else a sentence for the state.
 * Null while it is fine or still connecting.
 */
export const screenHint = (status: ScreenStatus | null): string | null => {
  if (status === null || status.state === 'Disconnected') return SCREEN_HINTS.Disconnected
  if (SCREEN_HINTS[status.state] === null) return null
  return status.detail ?? SCREEN_HINTS[status.state]
}
