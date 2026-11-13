import type { SprintCommand, SprintState } from '../bridge'
import { parseCorpusLap } from './AnalysisDomain'
import type { CorpusLap } from './AnalysisDomain'
import type { HudReadingSet } from '../hud/hudModel'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** A track layout driven in one car: the laps it makes sense to train against (`LiveCompareCourse`). */
export type CompareCourse = { game: string; trackCourse: string; carModel: string }

/** The lap the HUD chases (`LiveCompareTarget`). */
export type CompareTarget = { sessionId: string; lapNumber: number; label: string; lapTimeSeconds: number }

/** `state.compare`: the On track page's whole picture. */
export type CompareState = {
  courses: CompareCourse[]
  course: CompareCourse | null
  /** The fastest laps on `course` plus every lap a friend shared on it, fastest first; `lapCount` counts all of them. */
  laps: CorpusLap[]
  lapCount: number
  target: CompareTarget | null
  /** Training: the HUD is up and chasing the target. */
  hudOpen: boolean
  /** The HUD windows are up and unlocked on the monitor, to be moved, sized, added or removed there. */
  arranging: boolean
  /** A game holds the screen in exclusive fullscreen, where no HUD window can show. */
  fullscreen: boolean
  /** How much track the HUD shows behind and ahead of the car, in metres (`compare.range`). */
  metersBehind: number
  metersAhead: number
}

/** The host's defaults (`LiveCompareSettings`), for a host that does not say. */
const DEFAULT_METERS_BEHIND = 200
const DEFAULT_METERS_AHEAD = 600

export const EMPTY_COMPARE_STATE: CompareState = {
  courses: [],
  course: null,
  laps: [],
  lapCount: 0,
  target: null,
  hudOpen: false,
  arranging: false,
  fullscreen: false,
  metersBehind: DEFAULT_METERS_BEHIND,
  metersAhead: DEFAULT_METERS_AHEAD,
}

const positiveOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback)

function parseCourse(value: unknown): CompareCourse | null {
  if (!isRecord(value) || typeof value.game !== 'string' || typeof value.trackCourse !== 'string' || typeof value.carModel !== 'string') return null
  return { game: value.game, trackCourse: value.trackCourse, carModel: value.carModel }
}

function parseTarget(value: unknown): CompareTarget | null {
  if (!isRecord(value) || typeof value.sessionId !== 'string' || typeof value.lapNumber !== 'number') return null
  return {
    sessionId: value.sessionId,
    lapNumber: value.lapNumber,
    label: typeof value.label === 'string' ? value.label : `Lap ${value.lapNumber}`,
    lapTimeSeconds: typeof value.lapTimeSeconds === 'number' ? value.lapTimeSeconds : 0,
  }
}

/** Narrows `SprintState.compare` (present on the wire, undeclared on the bridge type) once, at this boundary. */
export function parseCompareState(sprint: SprintState): CompareState {
  const raw: unknown = sprint
  const compare = isRecord(raw) ? raw.compare : null
  if (!isRecord(compare)) return EMPTY_COMPARE_STATE
  return {
    courses: Array.isArray(compare.courses) ? compare.courses.map(parseCourse).filter((course): course is CompareCourse => course !== null) : [],
    course: parseCourse(compare.course),
    laps: Array.isArray(compare.laps) ? compare.laps.map(parseCorpusLap).filter((lap): lap is CorpusLap => lap !== null) : [],
    lapCount: typeof compare.lapCount === 'number' ? compare.lapCount : 0,
    target: parseTarget(compare.target),
    hudOpen: compare.hudOpen === true,
    arranging: compare.arranging === true,
    fullscreen: compare.fullscreen === true,
    metersBehind: positiveOr(compare.metersBehind, DEFAULT_METERS_BEHIND),
    metersAhead: positiveOr(compare.metersAhead, DEFAULT_METERS_AHEAD),
  }
}

/** The HUD's range choices, in metres, inside the host's limits (`LiveCompareSettings.IsRange`). */
export const HUD_METERS_BEHIND = [100, 200, 300, 500] as const
export const HUD_METERS_AHEAD = [300, 400, 600, 800, 1000, 1500] as const

/** A range picker's choices: the presets, plus the value in force when settings.json holds another one, in order. */
export const rangeChoices = (presets: readonly number[], current: number): number[] =>
  presets.includes(current) ? [...presets] : [...presets, current].sort((a, b) => a - b)

/** "600 m", "1.5 km": a range choice as the picker says it. */
export const formatRange = (meters: number): string => (meters >= 1000 ? `${Number((meters / 1000).toFixed(2))} km` : `${Math.round(meters)} m`)

export const buildHudRange = (metersBehind: number, metersAhead: number): SprintCommand => ({ type: 'compare.range', metersBehind, metersAhead })

/** The readings a HUD window can show, in the order the windows stack on a first open. */
export const HUD_CHART_ORDER = ['throttle', 'brake', 'speed', 'steering', 'gear'] as const

/** A HUD window's reading: the delta, or one of the charts. */
export type HudReadingId = 'delta' | (typeof HUD_CHART_ORDER)[number]

export const HUD_READING_LABELS: Record<HudReadingId, string> = {
  delta: 'Delta',
  throttle: 'Throttle',
  brake: 'Brake',
  speed: 'Speed',
  steering: 'Steering',
  gear: 'Gear',
}

/** How many readings are on. The page never lets the last one go: a HUD of nothing is refused. */
export const readingCount = (readings: HudReadingSet): number => readings.panelIds.length + (readings.showDelta ? 1 : 0)

/** Turns one reading on or off, keeping the charts in `HUD_CHART_ORDER` so the column reads the same every time. */
export function buildToggleReading(readings: HudReadingSet, id: HudReadingId): SprintCommand {
  if (id === 'delta') return { type: 'compare.readings', panelIds: readings.panelIds, showDelta: !readings.showDelta }
  const on = new Set(readings.panelIds)
  if (on.has(id)) on.delete(id)
  else on.add(id)
  return { type: 'compare.readings', panelIds: HUD_CHART_ORDER.filter((candidate) => on.has(candidate)), showDelta: readings.showDelta }
}

export const courseKey = (course: CompareCourse): string => `${course.game}\u0000${course.trackCourse}\u0000${course.carModel}`
export const courseLabel = (course: CompareCourse): string => `${course.trackCourse} · ${course.carModel}`

export const buildSelectCourse = (course: CompareCourse): SprintCommand => ({ type: 'compare.course', game: course.game, track: course.trackCourse, car: course.carModel })
export const buildSetTarget = (lap: CorpusLap): SprintCommand => ({ type: 'compare.target.set', sessionId: lap.sessionId, lapNumber: lap.lapNumber })
export const buildHudToggle = (): SprintCommand => ({ type: 'compare.hud.toggle' })
export const buildHudArrange = (arranging: boolean): SprintCommand => ({ type: 'compare.hud.arrange', arranging })

export const isTarget = (target: CompareTarget | null, lap: CorpusLap): boolean =>
  target !== null && target.sessionId === lap.sessionId && target.lapNumber === lap.lapNumber

/** How many of your own laps the page lists. Friends' laps are listed whatever their rank. */
export const OWN_LAPS_LISTED = 5

/**
 * The laps the page lists, fastest first: your fastest `OWN_LAPS_LISTED`, every lap a friend
 * shared, and the target wherever it ranks, so the lap being chased is always on the list.
 */
export function listedLaps(compare: CompareState): CorpusLap[] {
  let own = 0
  return compare.laps.filter((lap) => {
    if (lap.sharedFrom) return true
    own += 1
    return own <= OWN_LAPS_LISTED || isTarget(compare.target, lap)
  })
}

/** How many of the course's laps are your own: everything but the shared ones, all of which are listed. */
export const ownLapCount = (compare: CompareState): number => compare.lapCount - compare.laps.filter((lap) => lap.sharedFrom).length

/** What the page says about the lap being chased. */
export type ChasingFacts = {
  lapTimeSeconds: number
  /** The friend who shared it, or null for one of yours. */
  friend: string | null
  /** "Lap 5 · Mon, Sep 28", or the friend's name and when they drove it. */
  detail: string
  /** "0.383 s faster than your best", "Your best", or null with nothing of yours to compare. */
  versusBest: string | null
}

/** The target, said the way the page heads with it. Null with nothing picked. */
export function chasingFacts(compare: CompareState, when: (lap: CorpusLap) => string): ChasingFacts | null {
  const target = compare.target
  if (!target) return null
  const lap = compare.laps.find((candidate) => isTarget(target, candidate)) ?? null
  const best = compare.laps.find((candidate) => !candidate.sharedFrom) ?? null
  const gap = best ? Math.round((target.lapTimeSeconds - best.lapTimeSeconds) * 1000) / 1000 : null
  const versusBest =
    gap === null || !best
      ? null
      : isTarget(target, best)
        ? 'Your best'
        : gap === 0
          ? 'Level with your best'
          : `${Math.abs(gap).toFixed(3)} s ${gap < 0 ? 'faster' : 'slower'} than your best`
  return {
    lapTimeSeconds: target.lapTimeSeconds,
    friend: lap?.sharedFrom ?? null,
    detail: lap ? when(lap) : target.label,
    versusBest,
  }
}
