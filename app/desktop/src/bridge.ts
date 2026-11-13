import type { TelemetryFrame } from '@sprint/types'
import { parseHostFrame } from '@sprint/dashboard'
import { parseHudMessage } from './hud/hudModel'
import { parseDebugMessage } from './debug/debugModel'
import type { DebugMessage } from './debug/debugModel'
import type { HudMessage } from './hud/hudModel'
import { parseUpdateStatus } from './shell/updates'
import { parseSetupDriven, parseSetupLibrary, parseSetupSheet } from './views/SetupsDomain'
import type { SetupDriven, SetupLibrary, SetupSheet } from './views/SetupsDomain'
import { EMPTY_TRACE, parsePitWall, parsePitWallLayout, parsePitWallTrace } from './pitwall/pitWallData'
import type { PitWall, PitWallLayout, PitWallTrace, TraceLap } from './pitwall/pitWallData'
import { parseRaceFuelEstimate } from './views/SessionPlannerDomain'

export type AppView = 'Home' | 'SessionPlanner' | 'OnTrack' | 'Analysis' | 'Dashes' | 'Devices' | 'Setups' | 'RaceEngineer' | 'LiveLink' | 'Settings' | 'Help'
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

/** Something Quick plan could not detect and has to ask for (host: `QuickPlanField`). */
export type QuickPlanField = 'Context' | 'RaceLength' | 'Fuel'

/**
 * What Sprint already knows about the session about to be driven (host: `PlanDetection`, from
 * `SessionPlannerController.Detect`): the game/car/track (live, else remembered), the race length
 * when the game says it, whether the lap history covers the fuel, and what is still missing.
 * Quick plan shows the known parts read-only and asks only for `missing`.
 */
export type PlanDetection = {
  context: { game: string; car: string; track: string }
  raceLength: { format: 'TimeBased' | 'LapBased'; value: number } | null
  hasFuelHistory: boolean
  missing: QuickPlanField[]
}

/**
 * The plan dialogs' starting point (host: `PlanContextChoices`, `GET /api/planner/context`):
 * the prefilled game/car/track, the recorded spellings narrowed per game by the host, and what
 * Quick plan detected.
 */
export type PlanContextChoices = {
  prefill: { game: string; car: string; track: string }
  games: string[]
  tracks: string[]
  cars: string[]
  byGame: PlanGameChoices[]
  detection: PlanDetection
}

/** One figure of a race estimate (host: `EstimateFigure`): the median of the driver's laps here, or the plan's own value. */
export type EstimateFigure = { source: 'History'; value: number; laps: number } | { source: 'Plan'; value: number }

/**
 * A plan's race fuel (host: `RaceFuelEstimate`, `state.planFuel` by plan id): laps, the figures it
 * rests on, the litres with the reserve on top, and those litres per stint once the car's tank is
 * known. Null where it cannot be worked out, never a guess.
 */
export type RaceFuelEstimate = {
  laps: number | null
  lapTime: EstimateFigure | null
  fuelPerLap: EstimateFigure | null
  reserveLaps: number
  totalLiters: number | null
  tankLiters: number | null
  stints: { lapsPerStint: number; liters: number[] } | null
}

/**
 * What the driver's laps say about a car at a track (host: `FuelHistoryFigures`): the median lap time
 * and fuel per lap, each with the laps it rests on, and the largest tank recorded. Null without laps.
 */
export type FuelHistory = {
  lapTimeSeconds: number | null
  lapTimeLaps: number
  fuelPerLapLiters: number | null
  fuelLaps: number
  tankLiters: number | null
}

/** What the plan dialogs' fuel calculator works from (host: `PlanFuelEstimateRequest`); a null figure is an empty field. */
export type PlanFuelRequest = {
  game: string
  car: string
  track: string
  raceLengthFormat: 'Unknown' | 'TimeBased' | 'LapBased'
  raceLengthValue: number
  fuelReserveLaps: number
  avgLapTimeSeconds: number | null
  fuelPerLapLiters: number | null
}

/**
 * The calculator's answer (`POST /api/planner/fuel-estimate`): the history for the car and track and
 * the race worked out from the inputs, the host's reason it refused them, or no answer at all.
 */
export type PlanFuelPreview =
  | { outcome: 'ready'; history: FuelHistory; estimate: RaceFuelEstimate }
  | { outcome: 'invalid'; error: string }
  | { outcome: 'failed' }

export type PlanTargetScope = 'CurrentQualifying' | 'Qualifying' | 'Practice' | 'PracticeProgram' | 'Manual'
export type PlanTargetStatistic = 'Fastest' | 'Median' | 'Slowest' | 'Custom'

/** One lap a plan target can be (host: `PlanTargetOption`): always a lap that was driven. */
export type PlanTargetOption = {
  scope: PlanTargetScope
  programType: string | null
  statistic: PlanTargetStatistic
  lapTimeSeconds: number
  sampleSize: number
  lapSessionId: string
  lapNumber: number
  lapSessionStartedAt: string | null
  tierNote: string
}

/** One scope's picks (host: `PlanTargetScopeGroup`): its statistics, and every lap fastest first. */
export type PlanTargetScopeGroup = {
  scope: PlanTargetScope
  programType: string | null
  label: string
  sampleSize: number
  options: PlanTargetOption[]
  laps: PlanTargetOption[]
}

/**
 * Who the desktop is signed in to Sprint as. `serverUrl` outlives sign-out, to prefill the next sign-in.
 * `email` is empty for a Discord account.
 */
export type Account =
  | { signedIn: true; serverUrl: string; email: string; displayName: string }
  | { signedIn: false; serverUrl: string }

export type SignInResult = { ok: true } | { ok: false; error: string }

/** How a Discord sign-in ended (host: `DiscordSignInResult`). A timeout reads as failed, with its own message. */
export type DiscordSignInResult = { outcome: 'signedIn' } | { outcome: 'cancelled' } | { outcome: 'failed'; error: string }

/** A server's public settings (host: `POST /api/cloud/server-info`), or that it could not be read. */
export type ServerInfo =
  | { reachable: true; instanceName: string; allowRegistration: boolean; discordSignIn: boolean }
  | { reachable: false }

/** Mirrors `LiveUplinkStatus` in Sprint.Desktop.Core; the host sends enum names. */
export type LiveUplinkStatus = 'Off' | 'WaitingForGame' | 'Connecting' | 'Streaming' | 'Reconnecting'

const liveUplinkStatuses: readonly LiveUplinkStatus[] = ['Off', 'WaitingForGame', 'Connecting', 'Streaming', 'Reconnecting']

/** The live telemetry uplink: what it is doing and, while reconnecting, why. */
export type LiveUplink = { status: LiveUplinkStatus; detail: string | null }

/** Mirrors `PeerRole` in Sprint.Desktop.Core; the host sends enum names. */
export type LinkRole = 'Driver' | 'Engineer'
/** Mirrors `PeerPath`: how a connected link's packets travel. */
export type LinkPath = 'LocalNetwork' | 'Ipv4' | 'Ipv6'
/** Mirrors `PeerReachability`: what STUN said about this PC's router. */
export type LinkReachability = 'Unknown' | 'Open' | 'Strict' | 'LocalOnly'

const linkPaths: readonly LinkPath[] = ['LocalNetwork', 'Ipv4', 'Ipv6']
const linkReachabilities: readonly LinkReachability[] = ['Unknown', 'Open', 'Strict', 'LocalOnly']

/** The session the driver is on track in (host: `LiveTarget`). */
export type LinkSession = { game: string; track: string; car: string; sessionType: string }

/** Four corners, front left first. */
export type Corners = readonly [number, number, number, number]

/** The newest telemetry sample from the driver (host: `LiveSample`), narrowed to what the page shows. */
export type LinkSample = {
  lap: number
  position: number
  lastLapTime: number
  bestLapTime: number
  delta: number
  lapValid: boolean
  speedKph: number
  gear: number
  fuel: number
  tyreTemps: Corners
  tyreWear: Corners
}

/** How a connected link is doing over the last second (host: `PeerLinkHealth`). */
export type LinkHealth = { path: LinkPath; roundTripMs: number | null; sampleRate: number; lossPercent: number | null }
/** The other side's Sprint (host `PeerBuild`): its version when it says, and whether either side needs an update. */
export type LinkPeer = { app: string | null; match: 'Same' | 'PeerOlder' | 'PeerNewer' }

/**
 * The live link to an engineer's or a driver's desktop (host: `PeerLinkState`), one shape per
 * phase. Only the driver invites and only the engineer joins, so those phases fix the role.
 */
export type LiveLink =
  | { phase: 'Off' }
  | { phase: 'Preparing'; role: LinkRole }
  | { phase: 'Inviting'; role: 'Driver'; code: string; reachability: LinkReachability }
  | { phase: 'Joining'; role: 'Engineer'; code: string; reachability: LinkReachability }
  | { phase: 'Connecting'; role: 'Driver'; reachability: LinkReachability }
  | {
      phase: 'Connected' | 'Interrupted'
      role: LinkRole
      reachability: LinkReachability
      health: LinkHealth
      session: LinkSession | null
      latest: LinkSample | null
      /** Null until the other side's first ping arrives. */
      peer: LinkPeer | null
      /** The engineer's pit wall data; null on the driver's side and until the first board arrives. */
      pitWall: PitWall | null
      /** The driver's side: whether the session plan goes over the link, and which plan that is. */
      sharingPlan: boolean
      sharedPlan: { id: string; name: string } | null
    }
  | { phase: 'Failed' | 'Ended'; role: LinkRole; detail: string }

export type CloudServerChoice = 'None' | 'Official' | 'SelfHosted'
export type CloudStorageMode = 'Local' | 'Both' | 'Remote'
export type SyncDirection = 'upload' | 'download'

/** What a sync did. A failed one still reports what it got through before stopping. */
export type SyncReport = { uploaded: number; downloaded: number; conflicts: number; removedLocally: number } & ({ ok: true } | { ok: false; error: string })

/**
 * The first-run answer and where data lives (`AppSettings.Cloud` on the host), plus the
 * official server's shipped address (null while there is none) and any running sync.
 */
export type CloudState = {
  setupDone: boolean
  server: CloudServerChoice
  storage: CloudStorageMode
  officialServerUrl: string | null
  progress: { direction: SyncDirection; done: number; total: number } | null
  lastSync: { at: string; direction: SyncDirection; report: SyncReport } | null
  live: LiveUplink
}

/** A dial position's name and colour, as the dash popup shows it. Colours never reach the wheel. */
export type MultiDialLabel = { label: string; color: string }

/**
 * One saved wheel's multi-position dial (`MultiDialState` on the host): where it sits on the
 * device picture (`x`/`y` as fractions of its width/height, `radius` of its width), the names
 * in force, and where it stands. `position` is null until the wheel has reported it; `changes`
 * counts real turns only.
 */
export type MultiDial = {
  deviceId: string
  label: string
  x: number
  y: number
  radius: number
  positions: MultiDialLabel[]
  invertPopup: boolean
  position: number | null
  changes: number
}

/** A Sprint server that answered on the local network. */
export type DiscoveredServer = { url: string; version: string }

/**
 * Le Mans Ultimate's install as the first-run setup and Settings show it (host: `firstRun.game`).
 * `folder` is the one in use, the driver's choice (`chosen`) or the one found; "" when none was found.
 */
export type GameFolder = { folder: string; chosen: boolean; found: boolean; setupCount: number; resultsCount: number }

/** The first-run setup (host: `firstRun`). `game` is null where the game is not supported (macOS). */
export type FirstRun = { done: boolean; game: GameFolder | null }

export type SprintState = {
  /** `frame` is converted from the host's telemetry JSON to the `@sprint/types` mirror the views read (`parseHostFrame` in `packages/dashboard/src/hostFrame.ts`). */
  telemetry: { frame: TelemetryFrame | null; link: TelemetryLink; hz: number }
  /** Active plan targets (`DashTargets` on the host). The dash renderer narrows it. */
  targets: unknown
  settings: Record<string, unknown>; controls: Record<string, unknown>; catalog: Record<string, unknown>; devices: Array<Record<string, unknown>>
  dashLayouts: Array<Record<string, unknown>>; setupTemplates: Array<Record<string, unknown>>; setupPrograms: Array<Record<string, unknown>>
  engineerControls: Array<Record<string, unknown>>; radioLog: Array<Record<string, unknown>>; engineerPushState: Record<string, unknown>
  plans: Array<Record<string, unknown>>
  /** Each plan's race fuel by plan id, worked out on the host over the lap history. */
  planFuel: Record<string, RaceFuelEstimate>
  /** How many sessions the lap-history corpus holds. The corpus itself is never in the state. */
  sessionCount: number
  /** Home's recent sessions, built on the host (`RecentSessions`); HomeDomain narrows it. Null with no sessions. */
  recentSessions: unknown
  resultsImport: ResultsImportSource
  firstRun: FirstRun
  account: Account
  cloud: CloudState
  link: LiveLink
  /** The engineer's pit wall pages and tiles, kept per PC (`pitwall-layout.json` on the host); null from an older host. */
  pitWallLayout: PitWallLayout | null
  /** Feature flags from the host's appsettings.json. `sprintWeb` off hides every account, sync and setup surface. */
  features: { sprintWeb: boolean }
  /** Catalog ids plugged into USB but not added yet, one per device (`DeviceDetection` on the host). */
  foundDevices: string[]
  /** Dash categories (`DashCategories` on the host): the fixed built-ins in page order, then the user's own. */
  dashCategories: DashCategoryLists
  /** Dash id → screen profile id → how many widgets a change to that size would leave out (`DashRefitLosses` on the host); sizes that lose none are absent. */
  dashRefitLosses: DashRefitLosses
  /** Every saved wheel whose preset has a multi-position dial. */
  multiDials: MultiDial[]
  screens: Array<{ deviceId: string; width: number; height: number; refreshHz: number; layout: unknown; pageId?: string; idle?: boolean; status: string }>
}
export type SprintCommand = { type: string; [key: string]: unknown }

/** Per dash, per screen profile id, the widgets a change to that size would leave out (only counts ≥ 1). */
export type DashRefitLosses = Record<string, Record<string, number>>

/** A dash's category is one of these names, or absent for "Other". */
export type DashCategoryLists = { builtIn: string[]; custom: string[] }

/** Saving a lap as a `.sprintlap` (`sprint:lap-export`). */
export type LapExportResult =
  | { outcome: 'saved'; fileName: string }
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; error: string }

/**
 * A `.sprintlap` opened to be imported, read by the host but not filed yet (`sprint:lap-open`,
 * host `POST /api/laps/import/preview`): who drove it, where, in what, how fast and when, and
 * whether it is already in the driver's laps. `token` names it to `importLapFile`/`discardLapFile`.
 */
export type LapFileOffer = {
  token: string
  sharedBy: string
  track: string
  car: string
  lapTimeSeconds: number
  /** Null when the file does not say. */
  drivenAt: string | null
  alreadyPresent: boolean
}

/** Opening a `.sprintlap`: what it holds, or that the driver cancelled the picker, or which way the file is unreadable. */
export type LapFileOpenResult = { outcome: 'opened'; offer: LapFileOffer } | { outcome: 'cancelled' } | { outcome: 'failed'; error: string }

/** Filing an opened `.sprintlap` once the driver confirmed it (`sprint:lap-import`, host `POST /api/laps/import`). */
export type LapImportResult =
  | { outcome: 'imported' | 'alreadyPresent'; sharedBy: string; track: string; car: string; lapTimeSeconds: number }
  | { outcome: 'failed'; error: string }

/**
 * Where Sprint's self-update stands (electron/updatePolicy.ts). `available` only happens with
 * automatic installs off; `ready` installs when Sprint quits, or now via `restartToUpdate`.
 * `unsupported` is a dev build, another platform, or no Electron at all.
 */
export type UpdateStatus =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'failed'; reason: string }

export type SprintBridge = {
  getState(): Promise<SprintState>
  sendCommand(command: SprintCommand): Promise<void>
  subscribe(listener: (state: SprintState) => void): () => void
  /** Lap traces are too large for the polled state, so they are fetched on demand. */
  analysisTrace(sessionId: string, lapNumber: number): Promise<unknown>
  /** Opens a save dialog and writes the lap as a `.sprintlap`. */
  exportLap(sessionId: string, lapNumber: number): Promise<LapExportResult>
  /** Opens a file dialog and has the host read the chosen `.sprintlap`; nothing is filed until `importLapFile`. */
  openLapFile(): Promise<LapFileOpenResult>
  /** Files the opened lap file into the corpus: the driver confirmed what `openLapFile` showed. */
  importLapFile(token: string): Promise<LapImportResult>
  /** Forgets the opened lap file: the driver cancelled. */
  discardLapFile(token: string): Promise<void>
  /** Opens a folder picker; null when the driver cancelled it (or there is no Electron). */
  pickFolder(title: string): Promise<string | null>
  diagnosticsLogs(minLevel: string, text: string): Promise<unknown>
  /** Fetched when Quick plan or New plan… opens (with what Quick plan detected): building it reads every lap-history file. */
  planContext(): Promise<PlanContextChoices>
  /** The plan's target choices per scope; empty when nothing was driven or imported for its car and track. */
  planTargets(planId: string): Promise<PlanTargetScopeGroup[]>
  /** The plan dialogs' fuel calculator: the history for the car and track, and the race from what is typed. */
  planFuelEstimate(request: PlanFuelRequest): Promise<PlanFuelPreview>
  /** The game's setups, read from its folder on request: too slow and large for the polled state. */
  setups(): Promise<SetupLibrary>
  /** One setup's values as the file holds them now, or as `version` held them; null when there is no such setup. */
  setupSheet(id: string, version: string | null): Promise<SetupSheet | null>
  /** How each version of one setup drove, over the runs the driver put it on; null when there is no such setup. */
  setupDriven(id: string): Promise<SetupDriven[] | null>
  /** `includeDeclined` is false for the startup prompt only, so "Not now" stays answered there. */
  resultsImportScan(includeDeclined: boolean): Promise<ResultsImportOffer>
  resultsImport(entries: readonly string[]): Promise<ResultsImportResult>
  resultsImportDecline(entries: readonly string[]): Promise<void>
  /** The update status now, then every change. */
  subscribeUpdates(listener: (status: UpdateStatus) => void): () => void
  /** Each resolves once started; the outcome arrives through `subscribeUpdates`. */
  checkUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  /** Quits, installs the downloaded update and starts the new version. */
  restartToUpdate(): Promise<void>
  signIn(serverUrl: string, email: string, password: string, createAccount: boolean): Promise<SignInResult>
  /** Opens Discord in the system browser and resolves once the sign-in came back, was cancelled or timed out. */
  signInWithDiscord(serverUrl: string): Promise<DiscordSignInResult>
  cancelDiscordSignIn(): Promise<void>
  serverInfo(serverUrl: string): Promise<ServerInfo>
  signOut(): Promise<void>
  discoverServers(): Promise<DiscoveredServer[]>
  syncUp(): Promise<SyncReport>
  syncDown(): Promise<SyncReport>
  /** A training HUD window's own feed (electron/hud.ts), narrowed here. */
  subscribeHud(listener: (message: HudMessage) => void): () => void
  /** A HUD window's corner grip: the size it wants, and whether the drag has ended. */
  resizeHud(width: number, height: number, done: boolean): void
  /** Opens a dash in its own designer window, or brings that window forward. */
  openDashDesigner(dashId: string): Promise<void>
  /** Opens the pit wall, or brings it forward; with a target, brings that page's or tile's own window forward. */
  openPitWall(target?: { kind: 'page' | 'tile'; id: string }): Promise<void>
  /** A lap of the linked driver's, for the pit wall's traces; an empty trace when there is none. */
  pitWallTrace(lap: TraceLap): Promise<PitWallTrace>
  /** Dev runs only: opens the debug window, or brings it forward (electron/debugWindow.ts). */
  openDebugWindow(): Promise<void>
  /** The debug window's feed, a message per state poll, narrowed here. */
  subscribeDebug(listener: (message: DebugMessage) => void): () => void
  /** The debug window's Keep on top switch. */
  setDebugOnTop(onTop: boolean): void
}

type RawBridge = {
  getState(): Promise<unknown>
  sendCommand(command: unknown): Promise<unknown>
  subscribe(listener: (state: unknown) => void): () => void
  analysisTrace(sessionId: string, lapNumber: number): Promise<unknown>
  /** Absent in an older preview stub. */
  exportLap?(sessionId: string, lapNumber: number): Promise<unknown>
  openLapFile?(): Promise<unknown>
  importLapFile?(token: string): Promise<unknown>
  discardLapFile?(token: string): Promise<unknown>
  /** Absent in the preview harness's stub. */
  pickFolder?(title: string): Promise<unknown>
  diagnosticsLogs(minLevel: string, text: string): Promise<unknown>
  planContext(): Promise<unknown>
  planTargets(planId: string): Promise<unknown>
  planFuelEstimate(request: PlanFuelRequest): Promise<unknown>
  setups(): Promise<unknown>
  setupSheet(id: string, version: string | null): Promise<unknown>
  setupDriven(id: string): Promise<unknown>
  resultsImportScan(includeDeclined: boolean): Promise<unknown>
  resultsImport(entries: readonly string[]): Promise<unknown>
  resultsImportDecline(entries: readonly string[]): Promise<unknown>
  /** All four absent in the preview harness's stub. */
  subscribeUpdates?(listener: (status: unknown) => void): () => void
  checkUpdates?(): Promise<unknown>
  downloadUpdate?(): Promise<unknown>
  restartToUpdate?(): Promise<unknown>
  signIn(serverUrl: string, email: string, password: string, createAccount: boolean): Promise<unknown>
  signInWithDiscord(serverUrl: string): Promise<unknown>
  cancelDiscordSignIn(): Promise<unknown>
  serverInfo(serverUrl: string): Promise<unknown>
  signOut(): Promise<unknown>
  discoverServers(): Promise<unknown>
  syncUp(): Promise<unknown>
  syncDown(): Promise<unknown>
  /** Both absent in the preview harness's stub. */
  subscribeHud?(listener: (message: unknown) => void): () => void
  resizeHud?(width: number, height: number, done: boolean): void
  /** Absent in the preview harness's stub. */
  openDashDesigner?(dashId: string): Promise<unknown>
  /** Both absent in an older preview stub. */
  openPitWall?(target?: { kind: 'page' | 'tile'; id: string }): Promise<unknown>
  pitWallTrace?(lap: string): Promise<unknown>
  /** All three absent in the preview harness's stub before the debug window, and in a packaged build's main process. */
  openDebugWindow?(): Promise<unknown>
  subscribeDebug?(listener: (message: unknown) => void): () => void
  setDebugOnTop?(onTop: boolean): void
}
declare global { interface Window { sprint?: RawBridge } }
const emptyState = (): SprintState => ({ telemetry: { frame: null, link: noLink(), hz: 0 }, targets: null, settings: {}, controls: {}, catalog: {}, devices: [], dashLayouts: [], setupTemplates: [], setupPrograms: [], engineerControls: [], radioLog: [], engineerPushState: {}, plans: [], planFuel: {}, sessionCount: 0, recentSessions: null, resultsImport: { available: false }, firstRun: { done: true, game: null }, account: { signedIn: false, serverUrl: '' }, cloud: emptyCloud(), link: { phase: 'Off' }, pitWallLayout: null, features: { sprintWeb: false }, foundDevices: [], multiDials: [], dashCategories: { builtIn: [], custom: [] }, dashRefitLosses: {}, screens: [] })
const emptyCloud = (): CloudState => ({ setupDone: true, server: 'None', storage: 'Local', officialServerUrl: null, progress: null, lastSync: null, live: liveOff() })
const liveOff = (): LiveUplink => ({ status: 'Off', detail: null })
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

/** Narrows the host's `firstRun` once. Anything malformed reads as done, so a confused host never locks the app. */
const parseFirstRun = (value: unknown): FirstRun => {
  if (!isRecord(value) || value.done !== false) return { done: true, game: null }
  const game = value.game
  return {
    done: false,
    game: isRecord(game)
      ? {
          folder: typeof game.folder === 'string' ? game.folder : '',
          chosen: game.chosen === true,
          found: game.found === true,
          setupCount: count(game.setupCount),
          resultsCount: count(game.resultsCount),
        }
      : null,
  }
}

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

/** Narrows the host's `CloudAccountState` once, here. Anything malformed reads as signed out. */
const parseAccount = (value: unknown): Account => {
  if (!isRecord(value)) return { signedIn: false, serverUrl: '' }
  const serverUrl = typeof value.serverUrl === 'string' ? value.serverUrl : ''
  if (value.signedIn !== true || typeof value.email !== 'string') return { signedIn: false, serverUrl }
  return { signedIn: true, serverUrl, email: value.email, displayName: typeof value.displayName === 'string' ? value.displayName : '' }
}

const parseSignInResult = (value: unknown): SignInResult => {
  if (isRecord(value) && value.ok === true) return { ok: true }
  const error = isRecord(value) && typeof value.error === 'string' && value.error.length > 0 ? value.error : 'The host returned an unexpected response.'
  return { ok: false, error }
}

const unexpected = 'The host returned an unexpected response.'

/** Narrows the host's `DiscordSignInResult` once, here. */
const parseDiscordSignInResult = (value: unknown): DiscordSignInResult => {
  if (!isRecord(value)) return { outcome: 'failed', error: unexpected }
  switch (value.outcome) {
    case 'SignedIn':
      return { outcome: 'signedIn' }
    case 'Cancelled':
      return { outcome: 'cancelled' }
    case 'TimedOut':
      return { outcome: 'failed', error: 'Nothing came back from the browser. Try again.' }
    default:
      return { outcome: 'failed', error: typeof value.error === 'string' && value.error.length > 0 ? value.error : unexpected }
  }
}

/** A Discord sign-in the host never answered (stopped, timed out) reads as failed, like any other. */
const discordFailed = (): DiscordSignInResult => ({ outcome: 'failed', error: 'Sprint’s host did not answer. Try again.' })

const parseServerInfo = (value: unknown): ServerInfo =>
  isRecord(value) && value.reachable === true
    ? {
        reachable: true,
        instanceName: typeof value.instanceName === 'string' && value.instanceName.length > 0 ? value.instanceName : 'Sprint',
        allowRegistration: value.allowRegistration !== false,
        discordSignIn: value.discordSignIn === true,
      }
    : { reachable: false }

const isLiveUplinkStatus = (value: unknown): value is LiveUplinkStatus =>
  typeof value === 'string' && liveUplinkStatuses.some((status) => status === value)

const parseLive = (value: unknown): LiveUplink =>
  isRecord(value) && isLiveUplinkStatus(value.status) ? { status: value.status, detail: optionalString(value.detail) } : liveOff()

const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0)

/** Narrows the host's `SyncReport` once, here. Anything malformed reads as a failed sync. */
const parseSyncReport = (value: unknown): SyncReport => {
  if (!isRecord(value)) return { uploaded: 0, downloaded: 0, conflicts: 0, removedLocally: 0, ok: false, error: 'The host returned an unexpected response.' }
  const counts = { uploaded: count(value.uploaded), downloaded: count(value.downloaded), conflicts: count(value.conflicts), removedLocally: count(value.removedLocally) }
  return typeof value.error === 'string' && value.error.length > 0 ? { ...counts, ok: false, error: value.error } : { ...counts, ok: true }
}

/** A sync the host never answered (stopped, timed out) reads as failed, like any other. */
const syncFailed = (): SyncReport => ({ uploaded: 0, downloaded: 0, conflicts: 0, removedLocally: 0, ok: false, error: 'Sprint’s host did not answer. Try again.' })

const isSyncDirection = (value: unknown): value is SyncDirection => value === 'upload' || value === 'download'

/**
 * Narrows the host's `cloud` state. A host that sends none predates the first-run setup, so it
 * reads as already set up rather than opening the setup over a working app.
 */
const parseCloud = (value: unknown): CloudState => {
  if (!isRecord(value)) return emptyCloud()
  const server: CloudServerChoice = value.server === 'Official' || value.server === 'SelfHosted' ? value.server : 'None'
  const storage: CloudStorageMode = value.storage === 'Both' || value.storage === 'Remote' ? value.storage : 'Local'
  const progress = isRecord(value.progress) && isSyncDirection(value.progress.direction)
    ? { direction: value.progress.direction, done: count(value.progress.done), total: count(value.progress.total) }
    : null
  const lastSync = isRecord(value.lastSync) && typeof value.lastSync.at === 'string' && isSyncDirection(value.lastSync.direction)
    ? { at: value.lastSync.at, direction: value.lastSync.direction, report: parseSyncReport(value.lastSync.report) }
    : null
  return {
    setupDone: value.setupDone !== false,
    server,
    storage,
    officialServerUrl: optionalString(value.officialServerUrl),
    progress,
    lastSync,
    live: parseLive(value.live),
  }
}

const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const isLinkPath = (value: unknown): value is LinkPath => typeof value === 'string' && linkPaths.some((path) => path === value)
const isLinkReachability = (value: unknown): value is LinkReachability =>
  typeof value === 'string' && linkReachabilities.some((reachability) => reachability === value)

const parseLinkSession = (value: unknown): LinkSession | null =>
  isRecord(value) ? { game: text(value.game), track: text(value.track), car: text(value.car), sessionType: text(value.sessionType) } : null

const parseLinkSample = (value: unknown): LinkSample | null => {
  if (!isRecord(value)) return null
  return {
    lap: finite(value.lap),
    position: finite(value.position),
    lastLapTime: finite(value.lastLapTime),
    bestLapTime: finite(value.bestLapTime),
    delta: finite(value.delta),
    lapValid: value.lapValid !== false,
    speedKph: finite(value.speedKph),
    gear: finite(value.gear),
    fuel: finite(value.fuel),
    tyreTemps: [finite(value.tyreTempFl), finite(value.tyreTempFr), finite(value.tyreTempRl), finite(value.tyreTempRr)],
    tyreWear: [finite(value.tyreWearFl), finite(value.tyreWearFr), finite(value.tyreWearRl), finite(value.tyreWearRr)],
  }
}

const optionalNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Narrows the host's `PeerLinkState` once, here. A phase missing what it needs reads as off. */
const parseLinkPeer = (value: unknown): LinkPeer | null => {
  if (!isRecord(value)) return null
  const match = value.match === 'Same' || value.match === 'PeerOlder' || value.match === 'PeerNewer' ? value.match : null
  return match ? { app: optionalString(value.app), match } : null
}

const parseLiveLink = (value: unknown): LiveLink => {
  if (!isRecord(value)) return { phase: 'Off' }
  const role: LinkRole | null = value.role === 'Driver' || value.role === 'Engineer' ? value.role : null
  const reachability = isLinkReachability(value.reachability) ? value.reachability : 'Unknown'
  const code = optionalString(value.code)
  switch (value.phase) {
    case 'Preparing':
      return role ? { phase: 'Preparing', role } : { phase: 'Off' }
    case 'Inviting':
      return code ? { phase: 'Inviting', role: 'Driver', code, reachability } : { phase: 'Off' }
    case 'Joining':
      return code ? { phase: 'Joining', role: 'Engineer', code, reachability } : { phase: 'Off' }
    case 'Connecting':
      return { phase: 'Connecting', role: 'Driver', reachability }
    case 'Connected':
    case 'Interrupted': {
      const health = isRecord(value.health) ? value.health : null
      if (!role || !health || !isLinkPath(health.path)) return { phase: 'Off' }
      return {
        phase: value.phase,
        role,
        reachability,
        health: { path: health.path, roundTripMs: optionalNumber(health.roundTripMs), sampleRate: finite(health.sampleRate), lossPercent: optionalNumber(health.lossPercent) },
        session: parseLinkSession(value.session),
        latest: parseLinkSample(value.latest),
        peer: parseLinkPeer(value.peer),
        pitWall: parsePitWall(value.pitWall),
        sharingPlan: value.sharingPlan === true,
        sharedPlan: isRecord(value.sharedPlan) && typeof value.sharedPlan.id === 'string' ? { id: value.sharedPlan.id, name: text(value.sharedPlan.name) } : null,
      }
    }
    case 'Failed':
    case 'Ended':
      return role ? { phase: value.phase, role, detail: optionalString(value.detail) ?? 'The link closed.' } : { phase: 'Off' }
    default:
      return { phase: 'Off' }
  }
}

const parseDiscovered = (value: unknown): DiscoveredServer[] =>
  isRecord(value) && Array.isArray(value.servers)
    ? value.servers.flatMap((server: unknown) =>
        isRecord(server) && typeof server.url === 'string' && server.url.length > 0
          ? [{ url: server.url, version: typeof server.version === 'string' ? server.version : '' }]
          : [],
      )
    : []

const QUICK_PLAN_FIELDS: readonly QuickPlanField[] = ['Context', 'RaceLength', 'Fuel']

const emptyDetection = (): PlanDetection => ({ context: { game: '', car: '', track: '' }, raceLength: null, hasFuelHistory: false, missing: [...QUICK_PLAN_FIELDS] })

const emptyPlanContext = (): PlanContextChoices => ({ prefill: { game: '', car: '', track: '' }, games: [], tracks: [], cars: [], byGame: [], detection: emptyDetection() })

/** Narrows the host's `PlanDetection`. Anything unreadable counts as not detected, so Quick plan asks for it. */
const parsePlanDetection = (value: unknown): PlanDetection => {
  if (!isRecord(value)) return emptyDetection()
  const context = isRecord(value.context) ? value.context : {}
  const text = (field: unknown): string => (typeof field === 'string' ? field : '')
  const format = value.raceLengthFormat === 'TimeBased' || value.raceLengthFormat === 'LapBased' ? value.raceLengthFormat : null
  const length = finiteOrNull(value.raceLengthValue)
  const listed: unknown[] = Array.isArray(value.missingFields) ? value.missingFields : [...QUICK_PLAN_FIELDS]
  return {
    context: { game: text(context.game), car: text(context.car), track: text(context.track) },
    raceLength: format !== null && length !== null && length > 0 ? { format, value: length } : null,
    hasFuelHistory: value.hasFuelHistory === true,
    missing: QUICK_PLAN_FIELDS.filter((field) => listed.includes(field)),
  }
}

const finiteOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Narrows `state.planFuel`, dropping any entry it cannot read rather than inventing one. */
const parsePlanFuel = (value: unknown): Record<string, RaceFuelEstimate> => {
  if (!isRecord(value)) return {}
  const fuel: Record<string, RaceFuelEstimate> = {}
  for (const [planId, entry] of Object.entries(value)) {
    const estimate = parseRaceFuelEstimate(entry)
    if (estimate) fuel[planId] = estimate
  }
  return fuel
}

const countOrZero = (value: unknown): number => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0)

/** Narrows the calculator's answer; an answer it cannot read is no answer rather than a made-up one. */
const parsePlanFuelPreview = (value: unknown): PlanFuelPreview => {
  if (!isRecord(value)) return { outcome: 'failed' }
  if (value.outcome === 'Invalid' && typeof value.error === 'string') return { outcome: 'invalid', error: value.error }
  const estimate = value.outcome === 'Ready' && isRecord(value.history) ? parseRaceFuelEstimate(value.estimate) : null
  if (!estimate || !isRecord(value.history)) return { outcome: 'failed' }
  const history = value.history
  return {
    outcome: 'ready',
    history: {
      lapTimeSeconds: finiteOrNull(history.lapTimeSeconds),
      lapTimeLaps: countOrZero(history.lapTimeLaps),
      fuelPerLapLiters: finiteOrNull(history.fuelPerLapLiters),
      fuelLaps: countOrZero(history.fuelLaps),
      tankLiters: finiteOrNull(history.tankLiters),
    },
    estimate,
  }
}

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
    detection: parsePlanDetection(value.detection),
  }
}

const PLAN_TARGET_SCOPES: readonly PlanTargetScope[] = ['CurrentQualifying', 'Qualifying', 'Practice', 'PracticeProgram', 'Manual']
const PLAN_TARGET_STATISTICS: readonly PlanTargetStatistic[] = ['Fastest', 'Median', 'Slowest', 'Custom']
const planTargetScope = (value: unknown): PlanTargetScope | null => PLAN_TARGET_SCOPES.find((scope) => scope === value) ?? null
const planTargetStatistic = (value: unknown): PlanTargetStatistic | null => PLAN_TARGET_STATISTICS.find((statistic) => statistic === value) ?? null

const parsePlanTargetOption = (value: unknown): PlanTargetOption[] => {
  if (!isRecord(value)) return []
  const scope = planTargetScope(value.scope)
  const statistic = planTargetStatistic(value.statistic)
  if (!scope || !statistic || typeof value.lapTimeSeconds !== 'number' || typeof value.lapSessionId !== 'string' || typeof value.lapNumber !== 'number') return []
  return [
    {
      scope,
      programType: typeof value.programType === 'string' ? value.programType : null,
      statistic,
      lapTimeSeconds: value.lapTimeSeconds,
      sampleSize: typeof value.sampleSize === 'number' ? value.sampleSize : 0,
      lapSessionId: value.lapSessionId,
      lapNumber: value.lapNumber,
      lapSessionStartedAt: typeof value.lapSessionStartedAt === 'string' ? value.lapSessionStartedAt : null,
      tierNote: typeof value.tierNote === 'string' ? value.tierNote : 'time only',
    },
  ]
}

/** Narrows the host's `PlanTargetChoices` once, here, to its scopes. */
const parsePlanTargets = (value: unknown): PlanTargetScopeGroup[] =>
  isRecord(value) && Array.isArray(value.scopes)
    ? value.scopes.flatMap((group: unknown) => {
        if (!isRecord(group)) return []
        const scope = planTargetScope(group.scope)
        if (!scope) return []
        return [
          {
            scope,
            programType: typeof group.programType === 'string' ? group.programType : null,
            label: typeof group.label === 'string' ? group.label : scope,
            sampleSize: typeof group.sampleSize === 'number' ? group.sampleSize : 0,
            options: Array.isArray(group.options) ? group.options.flatMap(parsePlanTargetOption) : [],
            laps: Array.isArray(group.laps) ? group.laps.flatMap(parsePlanTargetOption) : [],
          },
        ]
      })
    : []

const parseMultiDialLabel = (value: unknown): MultiDialLabel[] =>
  isRecord(value) && typeof value.label === 'string' && typeof value.color === 'string' ? [{ label: value.label, color: value.color }] : []

const parseMultiDials = (value: unknown): MultiDial[] =>
  Array.isArray(value)
    ? value.flatMap((dial): MultiDial[] => {
        if (!isRecord(dial) || typeof dial.deviceId !== 'string' || !Array.isArray(dial.positions)) return []
        const positions = dial.positions.flatMap(parseMultiDialLabel)
        const position = typeof dial.position === 'number' && dial.position >= 0 && dial.position < positions.length ? dial.position : null
        return [{
          deviceId: dial.deviceId,
          label: typeof dial.label === 'string' ? dial.label : '',
          x: finite(dial.x),
          y: finite(dial.y),
          radius: finite(dial.radius),
          positions,
          invertPopup: dial.invertPopup === true,
          position,
          changes: finite(dial.changes),
        }]
      })
    : []

const parseState = (value: unknown): SprintState => {
  if (!isRecord(value)) return emptyState()
  const telemetry = isRecord(value.telemetry) ? value.telemetry : {}
  const parsed = Object.assign(emptyState(), value)
  parsed.telemetry = {
    frame: parseHostFrame(telemetry.frame),
    link: parseLink(telemetry.status),
    hz: typeof telemetry.hz === 'number' && Number.isFinite(telemetry.hz) ? telemetry.hz : 0,
  }
  parsed.sessionCount = typeof value.sessionCount === 'number' && Number.isInteger(value.sessionCount) && value.sessionCount >= 0 ? value.sessionCount : 0
  parsed.resultsImport = parseResultsImportSource(value.resultsImport)
  parsed.firstRun = parseFirstRun(value.firstRun)
  parsed.account = parseAccount(value.account)
  parsed.cloud = parseCloud(value.cloud)
  parsed.link = parseLiveLink(value.link)
  parsed.pitWallLayout = parsePitWallLayout(value.pitWallLayout)
  parsed.features = { sprintWeb: isRecord(value.features) && value.features.sprintWeb === true }
  parsed.foundDevices = stringList(value.foundDevices)
  const categories = isRecord(value.dashCategories) ? value.dashCategories : {}
  parsed.dashCategories = { builtIn: stringList(categories.builtIn), custom: stringList(categories.custom) }
  parsed.dashRefitLosses = parseDashRefitLosses(value.dashRefitLosses)
  parsed.multiDials = parseMultiDials(value.multiDials)
  parsed.planFuel = parsePlanFuel(value.planFuel)
  return parsed
}
/** Keeps only whole positive counts; anything else from the host is no loss to warn about. */
const parseDashRefitLosses = (value: unknown): DashRefitLosses => {
  if (!isRecord(value)) return {}
  const losses: DashRefitLosses = {}
  for (const [dashId, perProfile] of Object.entries(value)) {
    if (!isRecord(perProfile)) continue
    const counts: Record<string, number> = {}
    for (const [profileId, count] of Object.entries(perProfile)) {
      if (typeof count === 'number' && Number.isInteger(count) && count > 0) counts[profileId] = count
    }
    losses[dashId] = counts
  }
  return losses
}

const parseLapExportResult = (value: unknown): LapExportResult => {
  if (isRecord(value) && value.outcome === 'saved' && typeof value.fileName === 'string') {
    return { outcome: 'saved', fileName: value.fileName }
  }
  if (isRecord(value) && value.outcome === 'cancelled') return { outcome: 'cancelled' }
  return { outcome: 'failed', error: isRecord(value) && typeof value.error === 'string' && value.error.length > 0 ? value.error : unexpected }
}

/** Narrows what opening a lap file said, once. A preview missing what the dialog shows reads as unreadable. */
const parseLapFileOpenResult = (value: unknown): LapFileOpenResult => {
  if (isRecord(value) && value.outcome === 'cancelled') return { outcome: 'cancelled' }
  if (isRecord(value) && value.outcome === 'Ready' && typeof value.token === 'string' && typeof value.lapTimeSeconds === 'number') {
    return {
      outcome: 'opened',
      offer: {
        token: value.token,
        sharedBy: typeof value.sharedBy === 'string' && value.sharedBy.length > 0 ? value.sharedBy : 'Unknown driver',
        track: text(value.track),
        car: text(value.car),
        lapTimeSeconds: value.lapTimeSeconds,
        drivenAt: optionalString(value.drivenAt),
        alreadyPresent: value.alreadyPresent === true,
      },
    }
  }
  return { outcome: 'failed', error: isRecord(value) && typeof value.error === 'string' && value.error.length > 0 ? value.error : unexpected }
}

const parseLapImportResult = (value: unknown): LapImportResult => {
  if (isRecord(value) && (value.outcome === 'Imported' || value.outcome === 'AlreadyPresent') && typeof value.lapTimeSeconds === 'number') {
    return {
      outcome: value.outcome === 'Imported' ? 'imported' : 'alreadyPresent',
      sharedBy: typeof value.sharedBy === 'string' ? value.sharedBy : 'Unknown driver',
      track: typeof value.track === 'string' ? value.track : '',
      car: typeof value.car === 'string' ? value.car : '',
      lapTimeSeconds: value.lapTimeSeconds,
    }
  }
  return { outcome: 'failed', error: isRecord(value) && typeof value.error === 'string' && value.error.length > 0 ? value.error : unexpected }
}

const noLapFiles = 'Lap files need the Sprint app.'

const raw = window.sprint
export const bridge: SprintBridge = raw
  ? {
      getState: async () => parseState(await raw.getState()),
      sendCommand: async (command) => { await raw.sendCommand(command) },
      subscribe: (listener) => raw.subscribe((state) => listener(parseState(state))),
      analysisTrace: (sessionId, lapNumber) => raw.analysisTrace(sessionId, lapNumber),
      exportLap: async (sessionId, lapNumber) =>
        raw.exportLap ? parseLapExportResult(await raw.exportLap(sessionId, lapNumber).catch(() => null)) : { outcome: 'failed', error: noLapFiles },
      openLapFile: async () => (raw.openLapFile ? parseLapFileOpenResult(await raw.openLapFile().catch(() => null)) : { outcome: 'failed', error: noLapFiles }),
      importLapFile: async (token) =>
        raw.importLapFile ? parseLapImportResult(await raw.importLapFile(token).catch(() => null)) : { outcome: 'failed', error: noLapFiles },
      discardLapFile: async (token) => { await raw.discardLapFile?.(token).catch(() => null) },
      pickFolder: async (title) => {
        const folder = raw.pickFolder ? await raw.pickFolder(title).catch(() => null) : null
        return typeof folder === 'string' && folder.length > 0 ? folder : null
      },
      diagnosticsLogs: (minLevel, text) => raw.diagnosticsLogs(minLevel, text),
      planContext: async () => parsePlanContext(await raw.planContext()),
      planTargets: (planId) => raw.planTargets(planId).then(parsePlanTargets, (): PlanTargetScopeGroup[] => []),
      planFuelEstimate: (request) => raw.planFuelEstimate(request).then(parsePlanFuelPreview, (): PlanFuelPreview => ({ outcome: 'failed' })),
      setups: () => raw.setups().then(parseSetupLibrary, (): SetupLibrary => ({ kind: 'failed' })),
      setupSheet: (id, version) => raw.setupSheet(id, version).then(parseSetupSheet, () => null),
      setupDriven: (id) => raw.setupDriven(id).then(parseSetupDriven, () => null),
      resultsImportScan: async (includeDeclined) => parseResultsImportOffer(await raw.resultsImportScan(includeDeclined)),
      resultsImport: async (entries) => parseResultsImportResult(await raw.resultsImport(entries)),
      resultsImportDecline: async (entries) => { await raw.resultsImportDecline(entries) },
      subscribeUpdates: (listener) => {
        if (!raw.subscribeUpdates) {
          listener({ kind: 'unsupported' })
          return () => undefined
        }
        return raw.subscribeUpdates((status) => listener(parseUpdateStatus(status)))
      },
      checkUpdates: async () => { await raw.checkUpdates?.() },
      downloadUpdate: async () => { await raw.downloadUpdate?.() },
      restartToUpdate: async () => { await raw.restartToUpdate?.() },
      signIn: async (serverUrl, email, password, createAccount) => parseSignInResult(await raw.signIn(serverUrl, email, password, createAccount)),
      signInWithDiscord: (serverUrl) => raw.signInWithDiscord(serverUrl).then(parseDiscordSignInResult, discordFailed),
      cancelDiscordSignIn: async () => { await raw.cancelDiscordSignIn() },
      serverInfo: (serverUrl) => raw.serverInfo(serverUrl).then(parseServerInfo, () => ({ reachable: false })),
      signOut: async () => { await raw.signOut() },
      discoverServers: async () => parseDiscovered(await raw.discoverServers()),
      syncUp: () => raw.syncUp().then(parseSyncReport, syncFailed),
      syncDown: () => raw.syncDown().then(parseSyncReport, syncFailed),
      subscribeHud: (listener) =>
        raw.subscribeHud
          ? raw.subscribeHud((message) => {
              const parsed = parseHudMessage(message)
              if (parsed) listener(parsed)
            })
          : () => undefined,
      resizeHud: (width, height, done) => raw.resizeHud?.(width, height, done),
      openDashDesigner: async (dashId) => { await raw.openDashDesigner?.(dashId) },
      openPitWall: async (target) => { await raw.openPitWall?.(target) },
      pitWallTrace: async (lap) => (raw.pitWallTrace ? parsePitWallTrace(await raw.pitWallTrace(lap).catch(() => null)) : EMPTY_TRACE),
      openDebugWindow: async () => { await raw.openDebugWindow?.() },
      subscribeDebug: (listener) =>
        raw.subscribeDebug
          ? raw.subscribeDebug((message) => {
              const parsed = parseDebugMessage(message)
              if (parsed) listener(parsed)
            })
          : () => undefined,
      setDebugOnTop: (onTop) => raw.setDebugOnTop?.(onTop),
    }
  : {
      // Outside Electron (plain `vite dev` in a browser) there is no host to talk to.
      getState: async () => emptyState(),
      sendCommand: async () => undefined,
      subscribe: () => () => undefined,
      analysisTrace: async () => null,
      exportLap: async () => ({ outcome: 'failed', error: noLapFiles }),
      openLapFile: async () => ({ outcome: 'failed', error: noLapFiles }),
      importLapFile: async () => ({ outcome: 'failed', error: noLapFiles }),
      discardLapFile: async () => undefined,
      pickFolder: async () => null,
      diagnosticsLogs: async () => null,
      planContext: async () => emptyPlanContext(),
      planTargets: async () => [],
      planFuelEstimate: async () => ({ outcome: 'failed' }),
      setups: async () => ({ kind: 'unavailable' }),
      setupSheet: async () => null,
      setupDriven: async () => null,
      resultsImportScan: async () => ({ entries: [], counts: [] }),
      resultsImport: async () => ({ outcome: 'failed', error: 'There is no Sprint host to import into.' }),
      resultsImportDecline: async () => undefined,
      subscribeUpdates: (listener) => {
        listener({ kind: 'unsupported' })
        return () => undefined
      },
      checkUpdates: async () => undefined,
      downloadUpdate: async () => undefined,
      restartToUpdate: async () => undefined,
      signIn: async () => ({ ok: false, error: 'There is no Sprint host to sign in from.' }),
      signInWithDiscord: async () => ({ outcome: 'failed', error: 'There is no Sprint host to sign in from.' }),
      cancelDiscordSignIn: async () => undefined,
      serverInfo: async () => ({ reachable: false }),
      signOut: async () => undefined,
      discoverServers: async () => [],
      syncUp: async () => ({ uploaded: 0, downloaded: 0, conflicts: 0, removedLocally: 0, ok: false, error: 'There is no Sprint host to sync.' }),
      syncDown: async () => ({ uploaded: 0, downloaded: 0, conflicts: 0, removedLocally: 0, ok: false, error: 'There is no Sprint host to sync.' }),
      subscribeHud: () => () => undefined,
      resizeHud: () => undefined,
      openDashDesigner: async () => undefined,
      openPitWall: async () => undefined,
      pitWallTrace: async () => EMPTY_TRACE,
      openDebugWindow: async () => undefined,
      subscribeDebug: () => () => undefined,
      setDebugOnTop: () => undefined,
    }
