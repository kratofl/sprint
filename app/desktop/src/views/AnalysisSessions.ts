import { dayLabel } from './AnalysisDomain'
import type { CorpusSession } from './AnalysisDomain'

/**
 * The Analysis sessions list: every session grouped by car and track, like Setups, with your best
 * lap there and how far each session's best was off it. Search and filter chips narrow the list
 * here in the page; the host sends every session. Pure; AnalysisView renders what this returns.
 */

/** What the list is narrowed to. An empty list of choices means "any". */
export type SessionFilters = { search: string; car: string[]; track: string[]; carClass: string[]; kind: string[] }

export const NO_SESSION_FILTERS: SessionFilters = { search: '', car: [], track: [], carClass: [], kind: [] }

export type SessionFilterKey = Exclude<keyof SessionFilters, 'search'>

/** The filter chips, in the order they are shown. */
export const SESSION_FILTERS: ReadonlyArray<{ key: SessionFilterKey; label: string }> = [
  { key: 'car', label: 'Car' },
  { key: 'track', label: 'Track' },
  { key: 'carClass', label: 'Class' },
  { key: 'kind', label: 'Session' },
]

const KIND_ORDER: readonly string[] = ['Practice', 'Quali', 'Race', 'Warm-up', 'Test day', 'Shared', 'Session']

/** The short kind a row's tag shows: "Practice", "Quali", "Race", or "Shared" for a friend's lap. */
export function kindLabel(session: CorpusSession): string {
  if (session.sharedFrom) return 'Shared'
  switch (session.kind) {
    case 'Practice':
      return 'Practice'
    case 'Qualifying':
      return 'Quali'
    case 'Race':
      return 'Race'
    case 'Warmup':
      return 'Warm-up'
    case 'TestDay':
      return 'Test day'
    case 'Unknown':
      return 'Session'
  }
}

const valueOf = (session: CorpusSession, key: SessionFilterKey): string | null => {
  switch (key) {
    case 'car':
      return session.context.carModel || null
    case 'track':
      return session.context.trackCourse || null
    case 'carClass':
      return session.context.carClass
    case 'kind':
      return kindLabel(session)
  }
}

/** Sessions matching every filter, and the search in their car, track, class, kind or who shared them. */
export function filterSessions(sessions: readonly CorpusSession[], filters: SessionFilters): CorpusSession[] {
  const words = filters.search.toLowerCase().split(/\s+/).filter(Boolean)
  return sessions.filter((session) => {
    for (const { key } of SESSION_FILTERS) {
      const chosen = filters[key]
      if (chosen.length > 0 && !chosen.includes(valueOf(session, key) ?? '')) return false
    }
    const { carModel, trackCourse, carClass } = session.context
    const haystack = `${carModel} ${trackCourse} ${carClass ?? ''} ${session.kind} ${kindLabel(session)} ${session.sharedFrom ?? ''}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

/** The choices a filter chip offers, with how many sessions each has: kinds in session order, the rest by name. */
export function sessionFilterChoices(sessions: readonly CorpusSession[], key: SessionFilterKey): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    const value = valueOf(session, key)
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (key === 'kind' ? KIND_ORDER.indexOf(a.value) - KIND_ORDER.indexOf(b.value) : a.value.localeCompare(b.value)))
}

export const toggleSessionFilter = (filters: SessionFilters, key: SessionFilterKey, value: string): SessionFilters => {
  const chosen = filters[key]
  return { ...filters, [key]: chosen.includes(value) ? chosen.filter((item) => item !== value) : [...chosen, value] }
}

export const hasSessionFilters = (filters: SessionFilters): boolean =>
  filters.search.trim() !== '' || SESSION_FILTERS.some(({ key }) => filters[key].length > 0)

/** One car at one track, with its sessions newest first and your best lap there. */
export type SessionGroup = {
  key: string
  car: string
  track: string
  /** The game's model ("Oreca 07"), from the first session that knows it; the car's name already says its class. */
  carType: string | null
  sessions: CorpusSession[]
  /** Your fastest lap in any of these sessions; friends' shared laps do not count. Null with none of your own. */
  yourBestSeconds: number | null
}

/**
 * Sessions grouped by car and track (and game, so two games' tracks never mix), newest group
 * first. The input is newest first, as the host sends it, and each group keeps that order.
 */
export function groupSessions(sessions: readonly CorpusSession[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>()
  for (const session of [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    const { game, carModel, trackCourse, carType } = session.context
    const key = `${game}\u0000${trackCourse}\u0000${carModel}`
    let group = groups.get(key)
    if (!group) {
      group = { key, car: carModel || 'Unknown car', track: trackCourse || 'Unknown track', carType: null, sessions: [], yourBestSeconds: null }
      groups.set(key, group)
    }
    group.carType ??= carType && !group.car.includes(carType) ? carType : null
    group.sessions.push(session)
    if (!session.sharedFrom && session.bestLapSeconds !== null && session.bestLapSeconds > 0) {
      group.yourBestSeconds = group.yourBestSeconds === null ? session.bestLapSeconds : Math.min(group.yourBestSeconds, session.bestLapSeconds)
    }
  }
  return [...groups.values()]
}

/** How far a session's best lap was off your best in its group, in seconds; 0 on the session that holds it. */
export const gapToYourBest = (session: CorpusSession, group: SessionGroup): number | null =>
  session.bestLapSeconds === null || group.yourBestSeconds === null ? null : Math.round((session.bestLapSeconds - group.yourBestSeconds) * 1000) / 1000

const CLOCK = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** A row's title: "Today · 21:10", "Thu, Nov 5 · 19:30", or "Ada Brandt’s lap" for a friend's. */
export function sessionTitle(session: CorpusSession): string {
  if (session.sharedFrom) return `${session.sharedFrom}’s lap`
  const day = session.day ? dayLabel(session.day) : dayLabel(session.startedAt)
  return `${day} · ${CLOCK.format(new Date(session.startedAt))}`
}

/** A row's second line: "3 runs · 9 laps", "28 laps" when the runs are not known, "Shared with you". */
export function sessionLine(session: CorpusSession): string {
  if (session.sharedFrom) return 'Shared with you'
  const laps = session.lapCount === 1 ? '1 lap' : `${session.lapCount} laps`
  if (session.runs === 0) return laps
  return `${session.runs === 1 ? '1 run' : `${session.runs} runs`} · ${laps}`
}

/** A group head's second line: "Oreca 07 · 5 sessions · 1 shared lap". */
export function groupLine(group: SessionGroup): string {
  const shared = group.sessions.filter((session) => session.sharedFrom).length
  const own = group.sessions.length - shared
  const parts = [group.carType, own > 0 ? (own === 1 ? '1 session' : `${own} sessions`) : null, shared > 0 ? (shared === 1 ? '1 shared lap' : `${shared} shared laps`) : null]
  return parts.filter((part): part is string => part !== null && part !== '').join(' · ')
}

/** The list shows your own sessions, or the laps others shared with you; the two never mix. */
export type ListScope = 'mine' | 'shared'

export const sessionsIn = (sessions: readonly CorpusSession[], scope: ListScope): CorpusSession[] =>
  sessions.filter((session) => (scope === 'shared') === (session.sharedFrom !== null))

/** One person's shared laps, newest first. */
export type SharedPerson = { name: string; sessions: CorpusSession[] }

/** Shared laps by who sent them, the person who sent one most recently first. */
export function groupShared(sessions: readonly CorpusSession[]): SharedPerson[] {
  const people = new Map<string, SharedPerson>()
  for (const session of [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
    if (!session.sharedFrom) continue
    let person = people.get(session.sharedFrom)
    if (!person) {
      person = { name: session.sharedFrom, sessions: [] }
      people.set(session.sharedFrom, person)
    }
    person.sessions.push(session)
  }
  return [...people.values()]
}

/** Your fastest lap with a shared lap's car on its track, from your own sessions; null when you never drove it. */
export function yourBestFor(shared: CorpusSession, sessions: readonly CorpusSession[]): number | null {
  let best: number | null = null
  for (const session of sessions) {
    if (session.sharedFrom || session.bestLapSeconds === null || session.bestLapSeconds <= 0) continue
    const { game, trackCourse, carModel } = session.context
    if (game !== shared.context.game || trackCourse !== shared.context.trackCourse || carModel !== shared.context.carModel) continue
    best = best === null ? session.bestLapSeconds : Math.min(best, session.bestLapSeconds)
  }
  return best
}

/** How a shared lap stands against yours there: "0.223 s faster than you", or "You haven’t driven it". */
export function sharedStanding(shared: CorpusSession, sessions: readonly CorpusSession[]): string {
  const yours = yourBestFor(shared, sessions)
  if (yours === null || shared.bestLapSeconds === null) return 'You haven’t driven it'
  const gap = Math.round((shared.bestLapSeconds - yours) * 1000) / 1000
  if (gap === 0) return 'Level with you'
  return `${Math.abs(gap).toFixed(3)} s ${gap < 0 ? 'faster' : 'slower'} than you`
}
