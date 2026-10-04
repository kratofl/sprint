import type { PlanContextChoices, SprintCommand } from '../bridge'
import type { StatusTone } from '../shell/Status'

/**
 * Session Planner domain model, parsing, and command builders.
 *
 * Hand-mirrored copy of the authoritative C# model in
 * `app/Sprint.Desktop.Core/Features/SessionPlanning/SessionPlanModels.cs` and
 * `PlanTargetModels.cs` — the same convention `DashesDomain.ts` uses for the
 * dash model. If those files change, this one must change with them.
 * `RuntimeCoordinator` has no command that writes `PlanTargets`: they are
 * rendered read-only here (see `PlanTarget` below).
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
export type PlanTargetScope = 'CurrentQualifying' | 'Qualifying' | 'Practice' | 'PracticeProgram' | 'Manual'
export type PlanTargetStatistic = 'Fastest' | 'Median' | 'Slowest' | 'Custom'

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
