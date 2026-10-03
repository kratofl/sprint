import type { TelemetryFrame } from '@sprint/types'
import { parseHostFrame } from './telemetryFrame'

export type AppView = 'Home' | 'SessionPlanner' | 'Analysis' | 'Dashes' | 'Devices' | 'Setups' | 'RaceEngineer' | 'Settings' | 'Help'
/** Mirrors `TelemetryConnectionState` in Sprint.Desktop.Api; the host sends enum names. */
export type TelemetryLinkState =
  | 'Disconnected' | 'Connecting' | 'WaitingForGame' | 'Connected'
  | 'Stale' | 'Unsupported' | 'PermissionDenied' | 'Faulted'

const telemetryLinkStates: readonly TelemetryLinkState[] = [
  'Disconnected', 'Connecting', 'WaitingForGame', 'Connected', 'Stale', 'Unsupported', 'PermissionDenied', 'Faulted',
]

export type TelemetryLink = {
  state: TelemetryLinkState
  sourceName: string
  /** Free-text reason from the source ("LMU_Data shared memory not found"). Display only. */
  detail: string | null
  lastFrameValid: boolean
  invalidReason: string | null
}

/** Mirrors `HistorySessionKind` in Sprint.Desktop.Core (LapHistoryModels.cs); the host sends enum names. */
export type HistorySessionKind = 'Practice' | 'Qualifying' | 'Race' | 'Warmup' | 'TestDay' | 'Unknown'

const historySessionKinds: readonly HistorySessionKind[] = ['Practice', 'Qualifying', 'Race', 'Warmup', 'TestDay', 'Unknown']

/** Whether the game has a results archive to import from (`state.resultsImport`); every import entry point hides when not. */
export type ResultsImportSource = { available: true; sourceName: string } | { available: false }

/**
 * What a results-archive scan offers (host: `ResultsImportOffer`). `entries` are the host's
 * opaque archive ids, handed back unchanged to import or decline exactly what was offered.
 * Empty `entries` means there is nothing new.
 */
export type ResultsImportOffer = { entries: string[]; counts: Array<{ kind: HistorySessionKind; count: number }> }

/** One import pass (host: `ResultsImportResult`). Zero imported is a real answer, not a failure. */
export type ResultsImportResult = { outcome: 'imported'; importedCount: number } | { outcome: 'failed'; error: string }

/** The tracks and cars recorded for one game. */
export type PlanGameChoices = { game: string; tracks: string[]; cars: string[] }

/**
 * The New plan dialog's starting point (host: `PlanContextChoices`, `GET /api/planner/context`):
 * the prefilled game/car/track, plus the recorded spellings, narrowed per game by the host.
 */
export type PlanContextChoices = {
  prefill: { game: string; car: string; track: string }
  games: string[]
  tracks: string[]
  cars: string[]
  byGame: PlanGameChoices[]
}

export type SprintState = {
  /** `frame` is already converted from the host's C# shape to the dash renderer's (`telemetryFrame.ts`). */
  telemetry: { frame: TelemetryFrame | null; link: TelemetryLink; hz: number }
  /** Active plan targets (`DashTargets` on the host). The dash renderer narrows it. */
  targets: unknown
  settings: Record<string, unknown>; controls: Record<string, unknown>; catalog: Record<string, unknown>; devices: Array<Record<string, unknown>>
  dashLayouts: Array<Record<string, unknown>>; setupTemplates: Array<Record<string, unknown>>; setupPrograms: Array<Record<string, unknown>>
  engineerControls: Array<Record<string, unknown>>; radioLog: Array<Record<string, unknown>>; engineerPushState: Record<string, unknown>
  plans: Array<Record<string, unknown>>; lapHistory: Array<Record<string, unknown>>
  resultsImport: ResultsImportSource
  screens: Array<{ deviceId: string; width: number; height: number; refreshHz: number; layout: unknown; pageId?: string; idle?: boolean; status: string; performance?: { sequence: number; bytes: number } }>
}
export type SprintCommand = { type: string; [key: string]: unknown }

/**
 * Result of one self-replacing install attempt (host: `POST /api/updates/install`,
 * `UpdateInstallResult`/`UpdateInstallOutcome`). `unavailable-in-dev` is synthesized by
 * the main process itself (see electron/main.ts) rather than the host — dev runs refuse
 * before ever making the request.
 */
export type UpdateInstallResult =
  | { outcome: 'unavailable-in-dev' }
  | { outcome: 'no-update' }
  | { outcome: 'staged'; version: string }
  | { outcome: 'failed'; version: string | null; reason: string }

export type SprintBridge = {
  getState(): Promise<SprintState>
  sendCommand(command: SprintCommand): Promise<void>
  subscribe(listener: (state: SprintState) => void): () => void
  /** Lap traces are too large for the polled state, so they are fetched on demand. */
  analysisTrace(sessionId: string, lapNumber: number): Promise<unknown>
  diagnosticsLogs(minLevel: string, text: string): Promise<unknown>
  /** Fetched when the New plan dialog opens: building it reads every lap-history file. */
  planContext(): Promise<PlanContextChoices>
  /** `includeDeclined` is false for the startup prompt only, so "Not now" stays answered there. */
  resultsImportScan(includeDeclined: boolean): Promise<ResultsImportOffer>
  resultsImport(entries: readonly string[]): Promise<ResultsImportResult>
  resultsImportDecline(entries: readonly string[]): Promise<void>
  checkUpdates(force: boolean): Promise<unknown>
  installUpdate(): Promise<UpdateInstallResult>
}

type RawBridge = {
  getState(): Promise<unknown>
  sendCommand(command: unknown): Promise<unknown>
  subscribe(listener: (state: unknown) => void): () => void
  analysisTrace(sessionId: string, lapNumber: number): Promise<unknown>
  diagnosticsLogs(minLevel: string, text: string): Promise<unknown>
  planContext(): Promise<unknown>
  resultsImportScan(includeDeclined: boolean): Promise<unknown>
  resultsImport(entries: readonly string[]): Promise<unknown>
  resultsImportDecline(entries: readonly string[]): Promise<unknown>
  checkUpdates(force: boolean): Promise<unknown>
  installUpdate(): Promise<unknown>
}
declare global { interface Window { sprint?: RawBridge } }
const emptyState = (): SprintState => ({ telemetry: { frame: null, link: noLink(), hz: 0 }, targets: null, settings: {}, controls: {}, catalog: {}, devices: [], dashLayouts: [], setupTemplates: [], setupPrograms: [], engineerControls: [], radioLog: [], engineerPushState: {}, plans: [], lapHistory: [], resultsImport: { available: false }, screens: [] })
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const noLink = (): TelemetryLink => ({ state: 'Disconnected', sourceName: '', detail: null, lastFrameValid: true, invalidReason: null })
const isLinkState = (value: unknown): value is TelemetryLinkState =>
  typeof value === 'string' && telemetryLinkStates.some((state) => state === value)
const optionalString = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

/** Narrows the host's `TelemetryStatus` once, here, so views never re-interpret it. */
const parseLink = (value: unknown): TelemetryLink => {
  if (!isRecord(value) || !isLinkState(value.state)) return noLink()
  return {
    state: value.state,
    sourceName: typeof value.sourceName === 'string' ? value.sourceName : '',
    detail: optionalString(value.detail),
    lastFrameValid: value.lastFrameValid !== false,
    invalidReason: optionalString(value.invalidReason),
  }
}

const stringList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
const isHistorySessionKind = (value: unknown): value is HistorySessionKind =>
  typeof value === 'string' && historySessionKinds.some((kind) => kind === value)

const parseResultsImportSource = (value: unknown): ResultsImportSource =>
  isRecord(value) && value.available === true
    ? { available: true, sourceName: typeof value.sourceName === 'string' && value.sourceName.length > 0 ? value.sourceName : 'the results archive' }
    : { available: false }

/** Narrows the host's `ResultsImportOffer` once, here. Anything malformed reads as "nothing new". */
const parseResultsImportOffer = (value: unknown): ResultsImportOffer => {
  if (!isRecord(value)) return { entries: [], counts: [] }
  const counts = Array.isArray(value.counts)
    ? value.counts.flatMap((row: unknown) =>
        isRecord(row) && isHistorySessionKind(row.kind) && typeof row.count === 'number' && row.count > 0 ? [{ kind: row.kind, count: row.count }] : [],
      )
    : []
  return { entries: stringList(value.entries), counts }
}

const parseResultsImportResult = (value: unknown): ResultsImportResult => {
  if (isRecord(value) && value.outcome === 'Imported' && typeof value.importedCount === 'number') {
    return { outcome: 'imported', importedCount: value.importedCount }
  }
  const error = isRecord(value) && typeof value.error === 'string' && value.error.length > 0 ? value.error : 'The host returned an unexpected response.'
  return { outcome: 'failed', error }
}

const emptyPlanContext = (): PlanContextChoices => ({ prefill: { game: '', car: '', track: '' }, games: [], tracks: [], cars: [], byGame: [] })

/** Narrows the host's `PlanContextChoices` once, here. */
const parsePlanContext = (value: unknown): PlanContextChoices => {
  if (!isRecord(value)) return emptyPlanContext()
  const prefill = isRecord(value.prefill) ? value.prefill : {}
  const text = (field: unknown): string => (typeof field === 'string' ? field : '')
  return {
    prefill: { game: text(prefill.game), car: text(prefill.car), track: text(prefill.track) },
    games: stringList(value.games),
    tracks: stringList(value.tracks),
    cars: stringList(value.cars),
    byGame: Array.isArray(value.byGame)
      ? value.byGame.flatMap((row: unknown) =>
          isRecord(row) && typeof row.game === 'string' ? [{ game: row.game, tracks: stringList(row.tracks), cars: stringList(row.cars) }] : [],
        )
      : [],
  }
}

const parseState = (value: unknown): SprintState => {
  if (!isRecord(value)) return emptyState()
  const telemetry = isRecord(value.telemetry) ? value.telemetry : {}
  const parsed = Object.assign(emptyState(), value)
  parsed.telemetry = {
    frame: parseHostFrame(telemetry.frame),
    link: parseLink(telemetry.status),
    hz: typeof telemetry.hz === 'number' && Number.isFinite(telemetry.hz) ? telemetry.hz : 0,
  }
  parsed.resultsImport = parseResultsImportSource(value.resultsImport)
  return parsed
}
/** Narrows the host's `UpdateInstallResult` once, here, so callers never re-interpret it. */
const parseUpdateInstallResult = (value: unknown): UpdateInstallResult => {
  if (!isRecord(value) || typeof value.outcome !== 'string') {
    return { outcome: 'failed', version: null, reason: 'The host returned an unexpected response.' }
  }
  switch (value.outcome) {
    case 'unavailable-in-dev':
      return { outcome: 'unavailable-in-dev' }
    case 'NoUpdate':
      return { outcome: 'no-update' }
    case 'Staged':
      return { outcome: 'staged', version: typeof value.version === 'string' ? value.version : 'unknown' }
    case 'Failed':
      return {
        outcome: 'failed',
        version: typeof value.version === 'string' ? value.version : null,
        reason: typeof value.reason === 'string' ? value.reason : 'The update could not be installed.',
      }
    default:
      return { outcome: 'failed', version: null, reason: 'The host returned an unexpected response.' }
  }
}

const raw = window.sprint
export const bridge: SprintBridge = raw
  ? {
      getState: async () => parseState(await raw.getState()),
      sendCommand: async (command) => { await raw.sendCommand(command) },
      subscribe: (listener) => raw.subscribe((state) => listener(parseState(state))),
      analysisTrace: (sessionId, lapNumber) => raw.analysisTrace(sessionId, lapNumber),
      diagnosticsLogs: (minLevel, text) => raw.diagnosticsLogs(minLevel, text),
      planContext: async () => parsePlanContext(await raw.planContext()),
      resultsImportScan: async (includeDeclined) => parseResultsImportOffer(await raw.resultsImportScan(includeDeclined)),
      resultsImport: async (entries) => parseResultsImportResult(await raw.resultsImport(entries)),
      resultsImportDecline: async (entries) => { await raw.resultsImportDecline(entries) },
      checkUpdates: (force) => raw.checkUpdates(force),
      installUpdate: async () => parseUpdateInstallResult(await raw.installUpdate()),
    }
  : {
      // Outside Electron (plain `vite dev` in a browser) there is no host to talk to.
      getState: async () => emptyState(),
      sendCommand: async () => undefined,
      subscribe: () => () => undefined,
      analysisTrace: async () => null,
      diagnosticsLogs: async () => null,
      planContext: async () => emptyPlanContext(),
      resultsImportScan: async () => ({ entries: [], counts: [] }),
      resultsImport: async () => ({ outcome: 'failed', error: 'There is no Sprint host to import into.' }),
      resultsImportDecline: async () => undefined,
      checkUpdates: async () => null,
      installUpdate: async () => ({ outcome: 'unavailable-in-dev' }),
    }
