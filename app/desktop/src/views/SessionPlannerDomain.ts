import type { EstimateFigure, FuelHistory, PlanContextChoices, PlanDetection, PlanFuelRequest, PlanTargetOption, PlanTargetScope, PlanTargetScopeGroup, PlanTargetStatistic, RaceFuelEstimate, SprintCommand } from '../bridge'
import type { StatusTone } from '../shell/Status'

/**
 * Session Planner domain model, parsing, and command builders.
 *
 * Hand-mirrored copy of the authoritative C# model in
 * `app/Sprint.Desktop.Core/Features/SessionPlanning/SessionPlanModels.cs` and
 * `PlanTargetModels.cs` — the same convention `DashesDomain.ts` uses for the
 * dash model. If those files change, this one must change with them.
 * Targets are written by `plan.setTarget` / `plan.clearTarget` with a pick from
 * `GET /api/planner/targets` (the bridge's `planTargets`).
 */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const numberOrNull = (value: unknown): number | null => (typeof value === 'number' ? value : null)

// ── Enums (persisted by name via JsonStringEnumConverter) ───────────────────

export type PlanStatus = 'Draft' | 'Armed' | 'Tracking' | 'Completed' | 'Abandoned'
export type SegmentKind = 'Qualifying' | 'Race'
export type PlanMode = 'Planned' | 'Quick'
export type RaceLengthFormat = 'Unknown' | 'TimeBased' | 'LapBased'
export type SegmentSource = 'Planned' | 'Manual' | 'Detected'
export type DetectionConfidence = 'None' | 'Low' | 'Medium' | 'High'
export type { PlanTargetScope, PlanTargetStatistic }

/** A plan status's dot colour, the same on every page: tracking = live, armed = ready, abandoned = interrupted. */
export const PLAN_STATUS_TONE: Record<PlanStatus, StatusTone> = {
  Draft: 'neutral',
  Armed: 'info',
  Tracking: 'success',
  Completed: 'neutral',
  Abandoned: 'warning',
}

const PLAN_STATUSES: readonly PlanStatus[] = ['Draft', 'Armed', 'Tracking', 'Completed', 'Abandoned']
const SEGMENT_KINDS: readonly SegmentKind[] = ['Qualifying', 'Race']
const PLAN_MODES: readonly PlanMode[] = ['Planned', 'Quick']
const RACE_LENGTH_FORMATS: readonly RaceLengthFormat[] = ['Unknown', 'TimeBased', 'LapBased']

const isPlanStatus = (value: unknown): value is PlanStatus => PLAN_STATUSES.includes(value as PlanStatus)
const isSegmentKind = (value: unknown): value is SegmentKind => SEGMENT_KINDS.includes(value as SegmentKind)
const isPlanMode = (value: unknown): value is PlanMode => PLAN_MODES.includes(value as PlanMode)
const isRaceLengthFormat = (value: unknown): value is RaceLengthFormat => RACE_LENGTH_FORMATS.includes(value as RaceLengthFormat)

// ── Model ────────────────────────────────────────────────────────────────

export type LapSummary = {
  lapNumber: number
  isValid: boolean
  lapTimeSeconds: number
  sectorsSeconds: number[]
  fuelUsedLiters: number | null
  fuelRemainingLiters: number | null
  tireSummary: string | null
  electronicsSummary: string | null
  setupReference: string | null
}

export type PlanSegment = {
  id: string
  kind: SegmentKind
  source: SegmentSource
  sourceConfidence: DetectionConfidence
  plannedStart: string | null
  plannedEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  liveSessionType: string
  detectedRaceFormat: RaceLengthFormat
  laps: LapSummary[]
}

export type PlanTarget = {
  scope: PlanTargetScope
  statistic: PlanTargetStatistic | null
  programType: string | null
  lapTimeSeconds: number
  sampleSize: number
  lapSessionId: string | null
  lapNumber: number | null
  lapSessionStartedAt: string | null
  hasReferenceCurve: boolean
  hasChannelTrace: boolean
  updatedAt: string
}

export type PlanTargets = { kind: SegmentKind; lapTime: PlanTarget | null }

export type PlanWarning = { kind: string; message: string; createdAt: string }

export type SessionPlan = {
  id: string
  name: string
  game: string
  car: string
  track: string
  status: PlanStatus
  mode: PlanMode
  qualifyingIncluded: boolean
  raceLengthFormat: RaceLengthFormat
  raceLengthValue: number
  fuelReserveLaps: number
  avgLapTimeSeconds: number | null
  fuelPerLapLiters: number | null
  setupReferences: string[]
  notes: string
  createdAt: string
  startedAt: string | null
  endedAt: string | null
  segments: PlanSegment[]
  targets: PlanTargets[]
  warnings: PlanWarning[]
}

// ── Parsing (SprintState.plans -> SessionPlan) ──────────────────────────────

function parseLapSummary(value: unknown): LapSummary | null {
  if (!isRecord(value) || typeof value.lapNumber !== 'number' || typeof value.lapTimeSeconds !== 'number') return null
  return {
    lapNumber: value.lapNumber,
    isValid: value.isValid !== false,
    lapTimeSeconds: value.lapTimeSeconds,
    sectorsSeconds: Array.isArray(value.sectorsSeconds) ? value.sectorsSeconds.filter((item): item is number => typeof item === 'number') : [],
    fuelUsedLiters: numberOrNull(value.fuelUsedLiters),
    fuelRemainingLiters: numberOrNull(value.fuelRemainingLiters),
    tireSummary: stringOrNull(value.tireSummary),
    electronicsSummary: stringOrNull(value.electronicsSummary),
    setupReference: stringOrNull(value.setupReference),
  }
}

function parseSegment(value: unknown): PlanSegment | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !isSegmentKind(value.kind)) return null
  return {
    id: value.id,
    kind: value.kind,
    source: value.source === 'Planned' || value.source === 'Detected' ? value.source : 'Manual',
    sourceConfidence:
      value.sourceConfidence === 'Low' || value.sourceConfidence === 'Medium' || value.sourceConfidence === 'High' ? value.sourceConfidence : 'None',
    plannedStart: stringOrNull(value.plannedStart),
    plannedEnd: stringOrNull(value.plannedEnd),
    actualStart: stringOrNull(value.actualStart),
    actualEnd: stringOrNull(value.actualEnd),
    liveSessionType: typeof value.liveSessionType === 'string' ? value.liveSessionType : '',
    detectedRaceFormat: isRaceLengthFormat(value.detectedRaceFormat) ? value.detectedRaceFormat : 'Unknown',
    laps: Array.isArray(value.laps) ? value.laps.map(parseLapSummary).filter((lap): lap is LapSummary => lap !== null) : [],
  }
}

function parsePlanTarget(value: unknown): PlanTarget | null {
  if (!isRecord(value) || typeof value.lapTimeSeconds !== 'number') return null
  const scope: PlanTargetScope =
    value.scope === 'CurrentQualifying' || value.scope === 'Qualifying' || value.scope === 'Practice' || value.scope === 'PracticeProgram'
      ? value.scope
      : 'Manual'
  const statistic: PlanTargetStatistic | null =
    value.statistic === 'Fastest' || value.statistic === 'Median' || value.statistic === 'Slowest' || value.statistic === 'Custom' ? value.statistic : null
  return {
    scope,
    statistic,
    programType: stringOrNull(value.programType),
    lapTimeSeconds: value.lapTimeSeconds,
    sampleSize: typeof value.sampleSize === 'number' ? value.sampleSize : 0,
    lapSessionId: stringOrNull(value.lapSessionId),
    lapNumber: numberOrNull(value.lapNumber),
    lapSessionStartedAt: stringOrNull(value.lapSessionStartedAt),
    hasReferenceCurve: value.hasReferenceCurve === true,
    hasChannelTrace: value.hasChannelTrace === true,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  }
}

function parseTargets(value: unknown): PlanTargets | null {
  if (!isRecord(value) || !isSegmentKind(value.kind)) return null
  return { kind: value.kind, lapTime: parsePlanTarget(value.lapTime) }
}

function parseWarning(value: unknown): PlanWarning | null {
  if (!isRecord(value) || typeof value.message !== 'string') return null
  return { kind: typeof value.kind === 'string' ? value.kind : '', message: value.message, createdAt: typeof value.createdAt === 'string' ? value.createdAt : '' }
}

/** Parses one raw `plans[]` row. Returns `null` for a row with no id — never a fabricated plan. */
export function parsePlan(row: Record<string, unknown>): SessionPlan | null {
  if (typeof row.id !== 'string' || row.id.length === 0) return null

  return {
    id: row.id,
    name: typeof row.name === 'string' ? row.name : 'New Session Plan',
    game: typeof row.game === 'string' ? row.game : '',
    car: typeof row.car === 'string' ? row.car : '',
    track: typeof row.track === 'string' ? row.track : '',
    status: isPlanStatus(row.status) ? row.status : 'Draft',
    mode: isPlanMode(row.mode) ? row.mode : 'Planned',
    qualifyingIncluded: row.qualifyingIncluded !== false,
    raceLengthFormat: isRaceLengthFormat(row.raceLengthFormat) ? row.raceLengthFormat : 'Unknown',
    raceLengthValue: typeof row.raceLengthValue === 'number' ? row.raceLengthValue : 0,
    fuelReserveLaps: typeof row.fuelReserveLaps === 'number' ? row.fuelReserveLaps : 1,
    avgLapTimeSeconds: numberOrNull(row.avgLapTimeSeconds),
    fuelPerLapLiters: numberOrNull(row.fuelPerLapLiters),
    setupReferences: Array.isArray(row.setupReferences) ? row.setupReferences.filter((item): item is string => typeof item === 'string') : [],
    notes: typeof row.notes === 'string' ? row.notes : '',
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    startedAt: stringOrNull(row.startedAt),
    endedAt: stringOrNull(row.endedAt),
    segments: Array.isArray(row.segments) ? row.segments.map(parseSegment).filter((segment): segment is PlanSegment => segment !== null) : [],
    targets: Array.isArray(row.targets) ? row.targets.map(parseTargets).filter((target): target is PlanTargets => target !== null) : [],
    warnings: Array.isArray(row.warnings) ? row.warnings.map(parseWarning).filter((warning): warning is PlanWarning => warning !== null) : [],
  }
}

/** Newest first, matching `SessionPlannerService.Plans`'s own ordering. */
export const parsePlans = (rows: ReadonlyArray<Record<string, unknown>>): SessionPlan[] =>
  rows
    .map(parsePlan)
    .filter((plan): plan is SessionPlan => plan !== null)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))

/** The plan currently holding the single active (armed/tracking) slot, if any. */
export const activePlan = (plans: readonly SessionPlan[]): SessionPlan | null =>
  plans.find((plan) => plan.status === 'Armed' || plan.status === 'Tracking') ?? null

export const targetsFor = (plan: SessionPlan, kind: SegmentKind): PlanTargets | null => plan.targets.find((target) => target.kind === kind) ?? null

export const openSegment = (plan: SessionPlan): PlanSegment | null =>
  plan.segments.find((segment) => segment.actualStart !== null && segment.actualEnd === null) ?? null

/**
 * The segment the planner offers to start next. Mirrors `SessionPlannerController.NextSegment`:
 * qualifying while the plan includes it and none has run, the race otherwise. The page shows
 * exactly one primary start action, and this decides which.
 */
export const nextSegment = (plan: SessionPlan): SegmentKind =>
  plan.qualifyingIncluded && plan.segments.every((segment) => segment.kind !== 'Qualifying') ? 'Qualifying' : 'Race'

/** Mirrors `SessionPlannerController.StartingRaceSkipsQualifying`: true gates a race start behind a confirm. */
export const startingRaceSkipsQualifying = (plan: SessionPlan): boolean => nextSegment(plan) === 'Qualifying'

/** Open plans are still in play (Draft/Armed/Tracking); the rest are finished. Both keep `plans`' order. */
export function groupPlans(plans: readonly SessionPlan[]): { open: SessionPlan[]; finished: SessionPlan[] } {
  const isFinished = (plan: SessionPlan) => plan.status === 'Completed' || plan.status === 'Abandoned'
  return { open: plans.filter((plan) => !isFinished(plan)), finished: plans.filter(isFinished) }
}

/** Every valid lap the plan recorded, oldest segment first, as lap times in seconds. */
const validLapTimes = (plan: SessionPlan): number[] =>
  plan.segments.flatMap((segment) => segment.laps.filter((lap) => lap.isValid).map((lap) => lap.lapTimeSeconds))

/** The last `limit` valid lap times, oldest → newest — the plan row's thumbnail strip. */
export const recentLapTimes = (plan: SessionPlan, limit = 20): number[] => validLapTimes(plan).slice(-limit)

/** Lap count (valid or not) and the best valid lap, across every segment. */
export function planLapStats(plan: SessionPlan): { laps: number; bestLapSeconds: number | null } {
  const times = validLapTimes(plan)
  return {
    laps: plan.segments.reduce((total, segment) => total + segment.laps.length, 0),
    bestLapSeconds: times.length > 0 ? Math.min(...times) : null,
  }
}

// ── Formatting ───────────────────────────────────────────────────────────

/** Mirrors `PlanTargetResolver.FormatLapTime`: m:ss.d, or an em dash for nothing driven yet. */
export function formatLapTime(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—'
  const totalMs = Math.round(seconds * 1000)
  const minutes = Math.floor(totalMs / 60000)
  const secs = Math.floor((totalMs % 60000) / 1000)
  const tenth = Math.floor((totalMs % 1000) / 100)
  return `${minutes}:${String(secs).padStart(2, '0')}.${tenth}`
}

export function formatClock(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/** Mirrors `PlanTargetOption.TierNote`. */
export function targetTierNote(target: PlanTarget): string {
  if (target.hasReferenceCurve && target.hasChannelTrace) return 'full trace'
  if (target.hasReferenceCurve) return 'reference curve'
  return 'time only'
}

export const raceLengthUnit = (format: RaceLengthFormat): string => (format === 'LapBased' ? 'laps' : 'minutes')

export const raceLengthLabel = (plan: SessionPlan): string =>
  plan.raceLengthFormat === 'Unknown' ? 'Not set' : `${plan.raceLengthValue} ${raceLengthUnit(plan.raceLengthFormat)}`

const TARGET_SCOPE_LABELS: Record<PlanTargetScope, string> = {
  CurrentQualifying: 'This qualifying',
  Qualifying: 'Qualifying',
  Practice: 'Practice',
  PracticeProgram: 'Practice program',
  Manual: 'Manual',
}

/** Where a target came from, in words: "Practice · Fastest". */
export const targetSourceLabel = (target: PlanTarget): string =>
  [TARGET_SCOPE_LABELS[target.scope], target.statistic].filter((part): part is string => part !== null).join(' · ')

// ── New plan context (GET /api/planner/context) ─────────────────────────────

/**
 * The recorded tracks and cars to offer for the typed game: that game's own, narrowed by the host
 * (`PlanContextOptions.For`), else everything — a game with nothing recorded yet would narrow to
 * an empty list, which reads as "there are no choices" rather than "nothing recorded for it".
 */
export function choicesForGame(choices: PlanContextChoices, game: string): { tracks: string[]; cars: string[] } {
  const wanted = game.trim().toLowerCase()
  const match = wanted.length > 0 ? choices.byGame.find((entry) => entry.game.toLowerCase() === wanted) : undefined
  return match ? { tracks: match.tracks, cars: match.cars } : { tracks: choices.tracks, cars: choices.cars }
}

/**
 * What an unnamed plan is called: "Track – Car", or "New Session Plan" with neither. Mirrors
 * `SessionPlannerService.DerivedName`, which names a plan created with a blank name, so the name
 * field's placeholder is exactly the name the plan gets.
 */
export function derivedPlanName(track: string, car: string): string {
  const parts = [track.trim(), car.trim()].filter((part) => part.length > 0)
  return parts.length === 0 ? 'New Session Plan' : parts.join(' – ')
}

/** A typed figure, or null for "not typed": empty, 0 and anything that is not a positive number alike. */
export const positiveOrNull = (text: string): number | null => {
  const value = Number(text)
  return text.trim().length > 0 && Number.isFinite(value) && value > 0 ? value : null
}

// ── A plan's lap time and fuel per lap (the plan dialogs' fields) ───────────

/**
 * A plan dialog's lap time or fuel per lap. Filled from the driver's laps with this car at this
 * track (`history`, with the laps the median rests on) until the driver types into it; from then
 * on it is theirs (`typed`), emptied too, and a new car or track never overwrites it.
 */
export type FigureField = { source: 'empty' } | { source: 'history'; value: number; laps: number } | { source: 'typed'; text: string }

export const EMPTY_FIGURE: FigureField = { source: 'empty' }

/** What the field shows. */
export const figureText = (field: FigureField): string => (field.source === 'typed' ? field.text : field.source === 'history' ? String(field.value) : '')

/** What the field sends and saves: exactly what it shows, or null when it is empty. */
export const figureValue = (field: FigureField): number | null => positiveOrNull(figureText(field))

/** A stored plan's own value is the driver's; a plan without one starts empty, ready for its history. */
export const storedFigure = (value: number | null): FigureField => (value ? { source: 'typed', text: String(value) } : EMPTY_FIGURE)

/**
 * The field once the history for its car and track has arrived: the driver's own value stays;
 * otherwise the median, rounded to what the field shows (`decimals`), or empty when the laps have
 * none. Returns the field itself when nothing changed, so a repeat answer does not re-render.
 */
export function prefillFigure(field: FigureField, median: number | null, laps: number, decimals: number): FigureField {
  if (field.source === 'typed') return field
  if (median === null || laps === 0) return field.source === 'empty' ? field : EMPTY_FIGURE
  const value = Number(median.toFixed(decimals))
  return field.source === 'history' && field.value === value && field.laps === laps ? field : { source: 'history', value, laps }
}

/** "From your 11 laps" under a field the driver's laps filled; null under any other. */
export const figureNote = (field: FigureField): string | null =>
  field.source === 'history' ? `From your ${field.laps} ${field.laps === 1 ? 'lap' : 'laps'}` : null

/** How many decimals a pre-filled figure keeps: a lap time to the thousandth, litres to the hundredth. */
const LAP_TIME_DECIMALS = 3
const FUEL_DECIMALS = 2

/** A plan dialog's two figures. */
export type PlanFigures = { lapTime: FigureField; fuelPerLap: FigureField }

/** Both figures once the history for the dialog's car and track has arrived (`prefillFigure`); the same object when neither changed. */
export function prefillFigures<T extends PlanFigures>(current: T, history: FuelHistory): T {
  const lapTime = prefillFigure(current.lapTime, history.lapTimeSeconds, history.lapTimeLaps, LAP_TIME_DECIMALS)
  const fuelPerLap = prefillFigure(current.fuelPerLap, history.fuelPerLapLiters, history.fuelLaps, FUEL_DECIMALS)
  return lapTime === current.lapTime && fuelPerLap === current.fuelPerLap ? current : { ...current, lapTime, fuelPerLap }
}

/** Whether a calculator answer was for this plan's car and track, so its history may fill this plan's fields. */
export const sameContext = (a: { game: string; car: string; track: string }, b: { game: string; car: string; track: string }): boolean =>
  a.game === b.game && a.car === b.car && a.track === b.track

/** What the race fuel still needs before it can be worked out, as Quick plan says it under the dash; null once it has a figure. */
export function fuelGap(plan: CreatePlanInput, estimate: RaceFuelEstimate): string | null {
  if (estimate.totalLiters !== null) return null
  if (plan.raceLengthFormat === 'Unknown') return 'Needs the race length'
  if (estimate.laps === null) return 'Needs a lap time'
  return 'Needs the fuel per lap'
}

/** The calculator's question (`POST /api/planner/fuel-estimate`) for the plan a dialog would save. */
export const planFuelRequest = (plan: CreatePlanInput): PlanFuelRequest => ({
  game: plan.game,
  car: plan.car,
  track: plan.track,
  raceLengthFormat: plan.raceLengthFormat,
  raceLengthValue: plan.raceLengthValue,
  fuelReserveLaps: plan.fuelReserveLaps,
  avgLapTimeSeconds: plan.avgLapTimeSeconds,
  fuelPerLapLiters: plan.fuelPerLapLiters,
})

/** The calculator asked only for the history of a car at a track: a plan dialog filling its figures. */
export const historyRequest = (context: { game: string; car: string; track: string }): PlanFuelRequest => ({
  ...context,
  raceLengthFormat: 'Unknown',
  raceLengthValue: 0,
  fuelReserveLaps: 0,
  avgLapTimeSeconds: null,
  fuelPerLapLiters: null,
})

/**
 * What Quick plan asks for: the context and race length where they were not detected, and always
 * the lap time, fuel per lap (pre-filled from the driver's laps here) and the reserve.
 */
export type QuickPlanAnswers = {
  game: string
  car: string
  track: string
  raceLengthFormat: 'TimeBased' | 'LapBased'
  raceLength: string
  lapTime: FigureField
  fuelPerLap: FigureField
  fuelReserveLaps: number
}

/**
 * The plan Quick plan creates: what was detected, and the driver's answers only where it was not.
 * Named by the host (blank name), qualifying included as in every new plan, and the lap time, fuel
 * per lap and reserve the driver confirmed (an empty figure leaves the estimate to the lap history).
 */
export function quickPlanInput(detection: PlanDetection, answers: QuickPlanAnswers): CreatePlanInput {
  const asked = (field: PlanDetection['missing'][number]) => detection.missing.includes(field)
  const context = asked('Context') ? { game: answers.game.trim(), car: answers.car.trim(), track: answers.track.trim() } : detection.context
  const typedLength = positiveOrNull(answers.raceLength)
  const length = detection.raceLength ?? (typedLength !== null ? { format: answers.raceLengthFormat, value: typedLength } : null)
  return {
    name: '',
    ...context,
    mode: 'Quick',
    qualifyingIncluded: true,
    raceLengthFormat: length?.format ?? 'Unknown',
    raceLengthValue: length?.value ?? 0,
    fuelReserveLaps: answers.fuelReserveLaps,
    avgLapTimeSeconds: figureValue(answers.lapTime),
    fuelPerLapLiters: figureValue(answers.fuelPerLap),
    notes: '',
  }
}

// ── Planner settings (AppSettings.SessionPlanner, behind the planner's gear) ────

export type FuelHistoryChoice = 'AllValidLaps' | 'MatchingSessionType'

/** The planner's own defaults: the reserve new plans start with, the laps a fuel estimate draws on, and the mismatch warning. */
export type PlannerSettings = { fuelReserveLaps: number; fuelHistorySource: FuelHistoryChoice; warnOnRaceFormatMismatch: boolean }

/** The most reserve the gear offers; `planner.settings` accepts up to `SessionPlannerSettings.MaxFuelReserveLaps`. */
export const RESERVE_CHOICES: readonly number[] = [0, 1, 2, 3]

/**
 * What `plan.create` / `plan.update` accept (host: `PlanLimits`, the reserve's `SessionPlannerSettings.MaxFuelReserveLaps`),
 * as the New plan dialog's `min`/`max`. The host refuses anything outside them either way.
 */
export const PLAN_LIMITS = {
  maxRaceLaps: 2000,
  maxRaceMinutes: 30 * 60,
  maxFuelReserveLaps: 10,
  minLapTimeSeconds: 10,
  maxLapTimeSeconds: 30 * 60,
  maxFuelPerLapLiters: 100,
} as const

/** The longest race a length input takes in `format`'s unit. */
export const maxRaceLength = (format: RaceLengthFormat): number => (format === 'LapBased' ? PLAN_LIMITS.maxRaceLaps : PLAN_LIMITS.maxRaceMinutes)

/** Reads `settings.sessionPlanner`, falling back to the host's own defaults for anything missing. */
export function readPlannerSettings(settings: Record<string, unknown>): PlannerSettings {
  const planner = isRecord(settings.sessionPlanner) ? settings.sessionPlanner : {}
  return {
    fuelReserveLaps: typeof planner.fuelReserveLaps === 'number' && Number.isInteger(planner.fuelReserveLaps) && planner.fuelReserveLaps >= 0 ? planner.fuelReserveLaps : 1,
    fuelHistorySource: planner.fuelHistorySource === 'MatchingSessionType' ? 'MatchingSessionType' : 'AllValidLaps',
    warnOnRaceFormatMismatch: planner.warnOnRaceFormatMismatch !== false,
  }
}

export const buildPlannerSettings = (patch: Partial<PlannerSettings>): SprintCommand => ({ type: 'planner.settings', ...patch })

/** "+1 lap", "+2 laps", "None": a reserve as the gear and the plan say it. */
export const reserveLabel = (laps: number): string => (laps === 0 ? 'None' : `+${laps} ${laps === 1 ? 'lap' : 'laps'}`)

/** "+1 lap reserve", "no reserve": the reserve under a fuel figure. */
export const reserveNote = (laps: number): string => (laps === 0 ? 'no reserve' : `${reserveLabel(laps)} reserve`)

// ── Race fuel (state.planFuel, RaceFuelEstimate on the host) ────────────────

const finiteOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const parseEstimateFigure = (value: unknown): EstimateFigure | null => {
  if (!isRecord(value)) return null
  const figure = finiteOrNull(value.value)
  if (figure === null) return null
  if (value.source === 'History') return { source: 'History', value: figure, laps: finiteOrNull(value.laps) ?? 0 }
  return value.source === 'Plan' ? { source: 'Plan', value: figure } : null
}

/** Narrows one plan's race fuel: a `state.planFuel` entry, or the `raceFuel` of a plan shared with the pit wall. */
export const parseRaceFuelEstimate = (value: unknown): RaceFuelEstimate | null => {
  if (!isRecord(value)) return null
  const stints = isRecord(value.stints) ? value.stints : null
  const lapsPerStint = stints ? finiteOrNull(stints.lapsPerStint) : null
  const liters = stints && Array.isArray(stints.liters) ? stints.liters.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : []
  return {
    laps: finiteOrNull(value.laps),
    lapTime: parseEstimateFigure(value.lapTime),
    fuelPerLap: parseEstimateFigure(value.fuelPerLap),
    reserveLaps: finiteOrNull(value.reserveLaps) ?? 0,
    totalLiters: finiteOrNull(value.totalLiters),
    tankLiters: finiteOrNull(value.tankLiters),
    stints: lapsPerStint !== null && liters.length > 0 ? { lapsPerStint, liters } : null,
  }
}

/** Where an estimate's figure came from, in words: "median of 46 laps", "from the plan". */
export const figureSource = (figure: EstimateFigure): string =>
  figure.source === 'History' ? `median of ${figure.laps} ${figure.laps === 1 ? 'lap' : 'laps'}` : 'from the plan'

/**
 * The litres each stint takes, rounded up and run together: "6 × 88 L, then 81 L", "2 × 48 L",
 * "73 L" for a race on one tank.
 */
export function stintsLabel(liters: readonly number[]): string {
  const runs: { liters: number; count: number }[] = []
  for (const stint of liters) {
    const rounded = Math.ceil(stint)
    const last = runs[runs.length - 1]
    if (last && last.liters === rounded) last.count++
    else runs.push({ liters: rounded, count: 1 })
  }
  return runs.map((run) => (run.count > 1 ? `${run.count} × ${run.liters} L` : `${run.liters} L`)).join(', then ')
}

/** "By laps", "By time": the race format the game reported, as the race card says it. */
export const detectedFormatLabel = (format: RaceLengthFormat): string | null =>
  format === 'LapBased' ? 'By laps' : format === 'TimeBased' ? 'By time' : null

/** The race format the game reported for the plan's race, once it has been driven; null before. */
export function detectedRaceFormat(plan: SessionPlan): RaceLengthFormat | null {
  const race = [...plan.segments].reverse().find((segment) => segment.kind === 'Race' && segment.detectedRaceFormat !== 'Unknown')
  return race ? race.detectedRaceFormat : null
}

// ── Command builders (RuntimeCoordinator: plan.*) ───────────────────────────

export type CreatePlanInput = {
  name: string
  game: string
  car: string
  track: string
  mode: PlanMode
  qualifyingIncluded: boolean
  raceLengthFormat: RaceLengthFormat
  raceLengthValue: number
  fuelReserveLaps: number
  avgLapTimeSeconds: number | null
  fuelPerLapLiters: number | null
  notes: string
}

export const buildPlanCreate = (input: CreatePlanInput): SprintCommand => ({ type: 'plan.create', ...input })

/**
 * A metadata patch only. `RuntimeCoordinator.UpdatePlan` pins id/status/segments/targets, and
 * — unlike `plan.create` — does not accept game/car/track either: those are create-only meaning
 * (see its doc comment), so this omits `mode`, `game`, `car`, and `track` from the create shape.
 */
export type UpdatePlanInput = Partial<Pick<CreatePlanInput, 'name' | 'qualifyingIncluded' | 'raceLengthFormat' | 'raceLengthValue' | 'fuelReserveLaps' | 'avgLapTimeSeconds' | 'fuelPerLapLiters' | 'notes'>>

export const buildPlanUpdate = (planId: string, patch: UpdatePlanInput): SprintCommand => ({ type: 'plan.update', planId, ...patch })

export const buildPlanDelete = (planId: string): SprintCommand => ({ type: 'plan.delete', planId })

export const buildPlanArm = (planId: string): SprintCommand => ({ type: 'plan.arm', planId })

export const buildPlanDisarm = (planId: string): SprintCommand => ({ type: 'plan.disarm', planId })

export const buildPlanStart = (planId: string, kind: SegmentKind): SprintCommand => ({ type: 'plan.start', planId, kind })

export const buildPlanStop = (planId: string): SprintCommand => ({ type: 'plan.stop', planId })

export const buildPlanReleaseActive = (): SprintCommand => ({ type: 'plan.releaseActive' })

export const buildPlanSetTarget = (planId: string, kind: SegmentKind, option: PlanTargetOption): SprintCommand => ({
  type: 'plan.setTarget',
  planId,
  kind,
  scope: option.scope,
  statistic: option.statistic,
  ...(option.programType !== null ? { programType: option.programType } : {}),
  ...(option.statistic === 'Custom' ? { lapSessionId: option.lapSessionId, lapNumber: option.lapNumber } : {}),
})

export const buildPlanClearTarget = (planId: string, kind: SegmentKind): SprintCommand => ({ type: 'plan.clearTarget', planId, kind })

// ── The weekend (the plan page's timeline and session cards) ────────────────

/** A stop on the plan's timeline: practice, the sessions the plan runs, then the finish. */
export type WeekendStop = 'Practice' | SegmentKind | 'Finish'

/** Where a session stands in the plan: driven, being driven, the one coming, after that, or not in it. */
export type SessionState = 'done' | 'live' | 'next' | 'later' | 'skipped'

/** The plan's stops in order, and the one it is at: the session being tracked, else the next one; a finished plan is at the finish. */
export function weekendTimeline(plan: SessionPlan): { stops: WeekendStop[]; at: number } {
  const stops: WeekendStop[] = plan.qualifyingIncluded ? ['Practice', 'Qualifying', 'Race', 'Finish'] : ['Practice', 'Race', 'Finish']
  if (plan.status === 'Completed') return { stops, at: stops.length - 1 }
  const at: WeekendStop = openSegment(plan)?.kind ?? nextSegment(plan)
  return { stops, at: stops.indexOf(at) }
}

export function sessionState(plan: SessionPlan, kind: SegmentKind): SessionState {
  if (kind === 'Qualifying' && !plan.qualifyingIncluded) return 'skipped'
  const open = openSegment(plan)
  if (open?.kind === kind) return 'live'
  if (plan.segments.some((segment) => segment.kind === kind)) return 'done'
  if (plan.status === 'Completed' || plan.status === 'Abandoned') return 'skipped'
  return open === null && nextSegment(plan) === kind ? 'next' : 'later'
}

/** "6 h", "45 min", "30 laps": a race length as a driver says it. */
export function formatRaceLength(format: RaceLengthFormat, value: number): string {
  if (format === 'LapBased') return `${value} laps`
  if (format !== 'TimeBased') return 'Not set'
  return value >= 60 && value % 60 === 0 ? `${value / 60} h` : `${value} min`
}

/** The plan's race length as a driver says it. */
export const raceLengthShort = (plan: SessionPlan): string => formatRaceLength(plan.raceLengthFormat, plan.raceLengthValue)

/** The practice driven at the plan's car and track: count, best, median, and the lap times oldest first. */
export type PracticeSummary = { laps: number; best: number; median: number; times: number[] }

export function practiceSummary(groups: readonly PlanTargetScopeGroup[]): PracticeSummary | null {
  const practice = groups.find((group) => group.scope === 'Practice')
  if (!practice || practice.laps.length === 0) return null
  const pick = (statistic: PlanTargetStatistic) => practice.options.find((option) => option.statistic === statistic)?.lapTimeSeconds
  const chronological = [...practice.laps].sort(
    (a, b) => (a.lapSessionStartedAt ?? '').localeCompare(b.lapSessionStartedAt ?? '') || a.lapNumber - b.lapNumber,
  )
  const times = chronological.map((lap) => lap.lapTimeSeconds)
  return { laps: practice.sampleSize || times.length, best: pick('Fastest') ?? Math.min(...times), median: pick('Median') ?? times[0], times }
}

/** What the plan does next, as a list row says it. */
export function nextStepLabel(plan: SessionPlan): string {
  switch (plan.status) {
    case 'Draft':
      return 'Arm'
    case 'Armed':
      return nextSegment(plan)
    case 'Tracking':
      return `${openSegment(plan)?.kind ?? 'Session'} · live`
    default:
      return '—'
  }
}

/** The target the plan chases next (the race's, once the plan is over). */
export function headlineTarget(plan: SessionPlan): PlanTarget | null {
  const kind: SegmentKind = plan.status === 'Completed' || plan.status === 'Abandoned' ? 'Race' : (openSegment(plan)?.kind ?? nextSegment(plan))
  return targetsFor(plan, kind)?.lapTime ?? null
}

/** The plan the list puts on top: the active one, else the newest open plan. */
export const upNextPlan = (plans: readonly SessionPlan[]): SessionPlan | null => activePlan(plans) ?? groupPlans(plans).open[0] ?? null

/** The one option a stored target points at, so the picker can mark it. */
export const isPickedTarget = (target: PlanTarget | null, option: PlanTargetOption): boolean =>
  target !== null &&
  target.scope === option.scope &&
  target.statistic === option.statistic &&
  (target.programType ?? null) === option.programType &&
  (option.statistic !== 'Custom' || (target.lapSessionId === option.lapSessionId && target.lapNumber === option.lapNumber))

/** Where a stored target came from, in a driver's words: "Fastest of 9 practice laps", "Lap 4 of qualifying". */
export function targetSummary(target: PlanTarget): string {
  const scope = (target.scope === 'PracticeProgram' && target.programType ? `${target.programType} practice` : TARGET_SCOPE_LABELS[target.scope]).toLowerCase()
  if (target.statistic === 'Custom' || target.statistic === null) return target.lapNumber !== null ? `Lap ${target.lapNumber} of ${scope}` : `A ${scope} lap`
  return `${target.statistic} of ${target.sampleSize} ${scope} ${target.sampleSize === 1 ? 'lap' : 'laps'}`
}
