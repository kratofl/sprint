import type { SprintCommand, SprintState } from '../bridge'
import { parseCorpusLap } from './AnalysisDomain'
import type { CorpusLap } from './AnalysisDomain'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** A track layout driven in one car: the laps it makes sense to train against (`LiveCompareCourse`). */
export type CompareCourse = { game: string; trackCourse: string; carModel: string }

/** The lap the HUD chases (`LiveCompareTarget`). */
export type CompareTarget = { sessionId: string; lapNumber: number; label: string; lapTimeSeconds: number }

/** `state.compare`: the On track page's whole picture. */
export type CompareState = {
  courses: CompareCourse[]
  course: CompareCourse | null
  /** The fastest laps on `course`; `lapCount` counts all of them. */
  laps: CorpusLap[]
  lapCount: number
  target: CompareTarget | null
  hudOpen: boolean
  /** A game holds the screen in exclusive fullscreen, where no HUD window can show. */
  fullscreen: boolean
}

/** `settings.liveCompare`: which readings get a HUD window, and whether the windows are locked. */
export type HudReadings = { panelIds: string[]; showDelta: boolean; locked: boolean }

export const EMPTY_COMPARE_STATE: CompareState = { courses: [], course: null, laps: [], lapCount: 0, target: null, hudOpen: false, fullscreen: false }

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
    fullscreen: compare.fullscreen === true,
  }
}

export function parseHudReadings(sprint: SprintState): HudReadings {
  const settings = sprint.settings.liveCompare
  if (!isRecord(settings)) return { panelIds: [...HUD_CHART_ORDER.slice(0, 3)], showDelta: true, locked: false }
  return {
    panelIds: Array.isArray(settings.panelIds) ? settings.panelIds.filter((id): id is string => typeof id === 'string') : [],
    showDelta: settings.showDelta !== false,
    locked: settings.locked === true,
  }
}

/** The readings a HUD window can show, in the order the windows stack on a first open. */
export const HUD_CHART_ORDER = ['throttle', 'brake', 'speed', 'steering', 'gear'] as const

export const HUD_READING_LABELS: Record<'delta' | (typeof HUD_CHART_ORDER)[number], string> = {
  delta: 'Delta',
  throttle: 'Throttle',
  brake: 'Brake',
  speed: 'Speed',
  steering: 'Steering',
  gear: 'Gear',
}

/** How many readings are on. The page never lets the last one go: a HUD of nothing is refused. */
export const readingCount = (readings: HudReadings): number => readings.panelIds.length + (readings.showDelta ? 1 : 0)

/** Turns one reading on or off, keeping the charts in `HUD_CHART_ORDER` so the column reads the same every time. */
export function buildToggleReading(readings: HudReadings, id: 'delta' | (typeof HUD_CHART_ORDER)[number]): SprintCommand {
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
export const buildHudLock = (locked: boolean): SprintCommand => ({ type: 'compare.hud.lock', locked })

export const isTarget = (target: CompareTarget | null, lap: CorpusLap): boolean =>
  target !== null && target.sessionId === lap.sessionId && target.lapNumber === lap.lapNumber
