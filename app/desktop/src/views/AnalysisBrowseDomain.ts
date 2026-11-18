import type { CorpusSession } from './AnalysisDomain'
import { kindLabel } from './AnalysisSessions'

/**
 * The Analysis list's sums: pick a car first, then see its sessions. Your sessions (never shared
 * laps) narrowed by the search and the Track, Date and Session filters, then cars grouped by class
 * with the recent ones on top, and the picked car's circuits with their layouts. Built for years
 * of racing: nothing here is ever a full list, the view shows the first few and "Show more".
 * Pure; AnalysisBrowse.tsx renders what this returns.
 */

/** The Date filter's choices: what was driven within the last so many days. */
export type DateRange = 'week' | 'month' | 'quarter' | 'year'

export const DATE_RANGES: ReadonlyArray<{ id: DateRange; label: string; days: number }> = [
  { id: 'week', label: 'Last 7 days', days: 7 },
  { id: 'month', label: 'Last 30 days', days: 30 },
  { id: 'quarter', label: 'Last 3 months', days: 91 },
  { id: 'year', label: 'Last 12 months', days: 365 },
]

/** What the list is narrowed to. Empty `circuits`/`kinds` and a null `date` mean "any". */
export type BrowseFilters = { search: string; circuits: string[]; kinds: string[]; date: DateRange | null }

export const NO_BROWSE_FILTERS: BrowseFilters = { search: '', circuits: [], kinds: [], date: null }

export const hasBrowseFilters = (filters: BrowseFilters): boolean =>
  filters.search.trim() !== '' || filters.circuits.length > 0 || filters.kinds.length > 0 || filters.date !== null

/** How many cars an open class shows before "Show more", and sessions a layout shows before "Show all". */
export const CLASS_PREVIEW = 5
export const LAYOUT_PREVIEW = 3
/** How many cars Recent holds. */
export const RECENT_COUNT = 5

const DAY_MS = 86_400_000

function drivenWithin(session: CorpusSession, range: DateRange, now: number): boolean {
  const days = DATE_RANGES.find((candidate) => candidate.id === range)?.days ?? 0
  return now - new Date(session.startedAt).getTime() <= days * DAY_MS
}

/** The model as a driver names the car ("Porsche 963"), else the game's car name. */
const modelOf = (session: CorpusSession): string => session.context.carType || session.context.carModel || 'Unknown car'

function matches(session: CorpusSession, filters: BrowseFilters, now: number): boolean {
  if (filters.circuits.length > 0 && !filters.circuits.includes(session.circuitName)) return false
  if (filters.kinds.length > 0 && !filters.kinds.includes(kindLabel(session))) return false
  if (filters.date !== null && !drivenWithin(session, filters.date, now)) return false
  const words = filters.search.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const { carModel, carType, trackCourse } = session.context
  const haystack = `${carModel} ${carType ?? ''} ${session.classTag} ${session.circuitName} ${session.layout} ${trackCourse}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/** The sessions every filter and the search let through. `now` is the clock the Date filter counts back from. */
export const browseSessions = (sessions: readonly CorpusSession[], filters: BrowseFilters, now: number): CorpusSession[] =>
  sessions.filter((session) => matches(session, filters, now))

function choices(values: readonly string[], chosen: readonly string[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>(chosen.map((value) => [value, 0]))
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].map(([value, count]) => ({ value, count }))
}

/** The Track filter's circuits, by name: only those the other filters leave, plus what is chosen. */
export const circuitChoices = (sessions: readonly CorpusSession[], filters: BrowseFilters, now: number): Array<{ value: string; count: number }> =>
  choices(
    browseSessions(sessions, { ...filters, circuits: [] }, now).map((session) => session.circuitName),
    filters.circuits,
  ).sort((a, b) => a.value.localeCompare(b.value))

/** Each circuit's country, for its flag in the Track filter. */
export const circuitCountries = (sessions: readonly CorpusSession[]): ReadonlyMap<string, string | null> =>
  new Map<string, string | null>(sessions.map((session) => [session.circuitName, session.country]))

/** The Date filter's ranges, each with how many sessions the other filters leave within it. */
export function dateChoices(sessions: readonly CorpusSession[], filters: BrowseFilters, now: number): Array<{ value: string; count: number }> {
  const others = browseSessions(sessions, { ...filters, date: null }, now)
  return DATE_RANGES.map((range) => ({ value: range.label, count: others.filter((session) => drivenWithin(session, range.id, now)).length }))
}

const KIND_ORDER = ['Practice', 'Quali', 'Race', 'Warm-up', 'Test day', 'Session']

/** The Session filter's kinds, in session order: only those the other filters leave, plus what is chosen. */
export const kindChoices = (sessions: readonly CorpusSession[], filters: BrowseFilters, now: number): Array<{ value: string; count: number }> =>
  choices(
    browseSessions(sessions, { ...filters, kinds: [] }, now).map(kindLabel),
    filters.kinds,
  ).sort((a, b) => KIND_ORDER.indexOf(a.value) - KIND_ORDER.indexOf(b.value))

/** The games in the list, the most recently driven first. */
export function gamesOf(sessions: readonly CorpusSession[]): string[] {
  return [...new Set([...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((session) => session.context.game))]
}

/** One car in one game, and every session with it, newest first. */
export type BrowseCar = {
  key: string
  game: string
  make: string | null
  model: string
  classTag: string
  sessions: CorpusSession[]
  /** How many circuits it was driven at. */
  circuits: number
}

/** Every car the sessions were driven in, the most recently driven first. */
export function browseCars(sessions: readonly CorpusSession[]): BrowseCar[] {
  const cars = new Map<string, BrowseCar>()
  for (const session of [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    const key = `${session.context.game}\u0000${session.context.carModel}`
    let car = cars.get(key)
    if (!car) {
      car = { key, game: session.context.game, make: session.make, model: modelOf(session), classTag: session.classTag, sessions: [], circuits: 0 }
      cars.set(key, car)
    }
    car.sessions.push(session)
  }
  return [...cars.values()].map((car) => ({ ...car, circuits: new Set(car.sessions.map((session) => session.circuitId)).size }))
}

/** The cars Recent offers: the newest few, or none when that would be every car anyway. */
export const recentCars = (cars: readonly BrowseCar[]): BrowseCar[] => (cars.length > RECENT_COUNT ? cars.slice(0, RECENT_COUNT) : [])

const CLASS_ORDER = ['HYP', 'GTP', 'LMP2', 'LMP2 ELMS', 'LMP3', 'LMGT3', 'GTE', 'GT3']
const CLASS_NAMES: Record<string, string> = { HYP: 'Hypercar', LMP2: 'LMP2 · WEC', 'LMP2 ELMS': 'LMP2 · ELMS' }

/** A class's heading: "Hypercar", "LMP2 · ELMS"; the tag itself for the rest. */
const className = (tag: string): string => CLASS_NAMES[tag] ?? tag

/** One class and its cars. */
export type ClassSection<T> = { tag: string; name: string; cars: T[] }

/** Where a class tag sorts among the classes: the racing order, unknown classes after, "Other" last. */
const classRank = (tag: string): number => (tag === 'Other' ? 1000 : CLASS_ORDER.includes(tag) ? CLASS_ORDER.indexOf(tag) : 100)

/**
 * Cars by class: racing's order (Hypercar, LMP2, …), classes the list does not know after it by
 * name, "Other" last. Within a class, the car with the most of what `count` counts (sessions on
 * Analysis, setups on Setups) first.
 */
export function classSections<T extends { classTag: string }>(cars: readonly T[], count: (car: T) => number): ClassSection<T>[] {
  const sections = new Map<string, T[]>()
  for (const car of cars) sections.set(car.classTag, [...(sections.get(car.classTag) ?? []), car])
  return [...sections]
    .sort(([a], [b]) => classRank(a) - classRank(b) || a.localeCompare(b))
    .map(([tag, inClass]) => ({ tag, name: className(tag), cars: [...inClass].sort((a, b) => count(b) - count(a)) }))
}

/** One layout of a circuit, its sessions newest first and your best on it. */
export type BrowseLayout = { trackCourse: string; label: string; sessions: CorpusSession[]; bestSeconds: number | null }

/** One circuit a car was driven at, with its layouts; the most recently driven first. */
export type BrowseCircuit = { id: string; name: string; country: string | null; layouts: BrowseLayout[]; sessionCount: number }

const bestOf = (sessions: readonly CorpusSession[]): number | null =>
  sessions.reduce<number | null>((best, session) => (session.bestLapSeconds !== null && session.bestLapSeconds > 0 && (best === null || session.bestLapSeconds < best) ? session.bestLapSeconds : best), null)

/** A car's sessions by circuit, then by layout: lap times never mix two layouts. Newest first throughout. */
export function circuitsOf(sessions: readonly CorpusSession[]): BrowseCircuit[] {
  const circuits = new Map<string, { circuit: BrowseCircuit; layouts: Map<string, CorpusSession[]> }>()
  for (const session of [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    let entry = circuits.get(session.circuitId)
    if (!entry) {
      entry = { circuit: { id: session.circuitId, name: session.circuitName, country: session.country, layouts: [], sessionCount: 0 }, layouts: new Map() }
      circuits.set(session.circuitId, entry)
    }
    const course = session.context.trackCourse
    entry.layouts.set(course, [...(entry.layouts.get(course) ?? []), session])
  }
  return [...circuits.values()].map(({ circuit, layouts }) => ({
    ...circuit,
    layouts: [...layouts].map(([trackCourse, onLayout]) => ({ trackCourse, label: onLayout[0].layout, sessions: onLayout, bestSeconds: bestOf(onLayout) })),
    sessionCount: [...layouts.values()].reduce((sum, onLayout) => sum + onLayout.length, 0),
  }))
}

/** How far a session's best was off your best on its layout, in seconds; 0 on the session that holds it. */
export const gapOnLayout = (session: CorpusSession, layout: BrowseLayout): number | null =>
  session.bestLapSeconds === null || layout.bestSeconds === null ? null : Math.round((session.bestLapSeconds - layout.bestSeconds) * 1000) / 1000

/** "Le Mans Ultimate" for the names a game goes by in records ("LeMansUltimate", "LMU"). */
export function gameName(game: string): string {
  const folded = game.replace(/\s+/g, '').toLowerCase()
  return folded === 'lemansultimate' || folded === 'lmu' ? 'Le Mans Ultimate' : game
}
