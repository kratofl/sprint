import { formatGap, formatLapSeconds, fuelText, tyreText } from './AnalysisDomain'
/**
 * Setups: the setups the game stores, read on request from the host (`/api/setups`,
 * `SetupLibrary` in Core). View-only: values are shown as the game wrote them beside each
 * index ("-1.0 deg", "P12"), never edited. Pure — the view fetches through `bridge` and renders
 * what this returns.
 */

export type SetupSession = 'Quali' | 'Race'
export type SetupStyle = 'Esport' | 'Safe' | 'Wet'
export type SetupTab = 'Power' | 'WheelsAndBrakes' | 'Suspension' | 'Dampers' | 'ChassisAndAero'

/** One setup the game stores, as the list shows it. */
export type SetupItem = {
  id: string
  name: string
  track: string
  trackName: string
  car: string
  carClass: string | null
  season: string | null
  /** When the game last wrote the file (ISO). */
  savedAt: string
  /** How many different contents Sprint has seen the file hold; at least one. */
  versions: number
  session: SetupSession | null
  style: SetupStyle | null
  version: string | null
}

export type SetupLibrary =
  | { kind: 'ready'; folder: string | null; setups: SetupItem[] }
  /** The game stores no setups Sprint can read (no Steam library on this machine). */
  | { kind: 'unavailable' }
  | { kind: 'failed' }

/** One value the driver sets, where it sits on the page and how the game wrote it. */
export type SetupReading = {
  section: string
  key: string
  tab: SetupTab
  /** "Front", "Rear left", "Gearbox"…; a corner is "<Axle> left|right". */
  group: string
  label: string
  display: string
  /** The game's own index: equal steps are the same setting, whatever language the display is in. */
  step: number | null
}

export type SetupVersion = { id: string; savedAt: string; isCurrent: boolean }

export type SetupSheet = { setup: SetupItem; versionId: string; readings: SetupReading[]; versions: SetupVersion[] }

/** A setup as it is now (`version` null) or as one of its older versions held it. */
export type SetupRef = { id: string; version: string | null }

/** Which of Setups' three pages is showing. */
export type SetupsPage = { kind: 'list' } | { kind: 'setup'; setup: SetupRef } | { kind: 'compare'; first: SetupRef; second: SetupRef }

export const LIST_PAGE: SetupsPage = { kind: 'list' }

export const TABS: ReadonlyArray<{ id: SetupTab; label: string }> = [
  { id: 'Power', label: 'Power' },
  { id: 'WheelsAndBrakes', label: 'Wheels & brakes' },
  { id: 'Suspension', label: 'Suspension' },
  { id: 'Dampers', label: 'Dampers' },
  { id: 'ChassisAndAero', label: 'Chassis & aero' },
]

const SESSIONS: readonly SetupSession[] = ['Quali', 'Race']
const STYLES: readonly SetupStyle[] = ['Esport', 'Safe', 'Wet']

// ── Parsing ────────────────────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const oneOf = <T extends string>(options: readonly T[], value: unknown): T | null => options.find((option) => option === value) ?? null
const TAB_IDS = TABS.map((tab) => tab.id)

const parseItem = (value: unknown): SetupItem | null => {
  if (!isRecord(value)) return null
  const id = text(value.id)
  const name = text(value.name)
  const savedAt = text(value.savedAt)
  if (!id || name === null || !savedAt) return null
  return {
    id,
    name,
    track: text(value.track) ?? '',
    trackName: text(value.trackName) ?? (text(value.track) || 'No track'),
    car: text(value.car) ?? 'Unknown car',
    carClass: text(value.carClass),
    season: text(value.season),
    savedAt,
    versions: typeof value.versions === 'number' && value.versions > 0 ? value.versions : 1,
    session: oneOf(SESSIONS, value.session),
    style: oneOf(STYLES, value.style),
    version: text(value.version),
  }
}

/** Narrows `/api/setups`. */
export const parseSetupLibrary = (value: unknown): SetupLibrary => {
  if (!isRecord(value)) return { kind: 'failed' }
  if (value.available === false) return { kind: 'unavailable' }
  const setups = Array.isArray(value.setups) ? value.setups.map(parseItem).filter((item): item is SetupItem => item !== null) : []
  return { kind: 'ready', folder: text(value.folder), setups }
}

const parseReading = (value: unknown): SetupReading | null => {
  if (!isRecord(value)) return null
  const tab = oneOf(TAB_IDS, value.tab)
  const label = text(value.label)
  const display = text(value.display)
  if (!tab || !label || display === null) return null
  return {
    section: text(value.section) ?? '',
    key: text(value.key) ?? label,
    tab,
    group: text(value.group) ?? '',
    label,
    display,
    step: typeof value.step === 'number' ? value.step : null,
  }
}

/** Narrows `/api/setups/sheet`; null for anything that is not one. */
/** How one setup version drove, over the runs the driver put it on (Features/Setup/SetupDriving.cs). */
export type SetupDriven = {
  versionId: string
  laps: number
  sessions: number
  bestLapSeconds: number | null
  medianLapSeconds: number | null
  fuelPerLapLiters: number | null
  tyres: Array<{ front: string | null; rear: string | null; laps: number }>
}

export const parseSetupDriven = (value: unknown): SetupDriven[] | null => {
  if (!Array.isArray(value)) return null
  const number = (input: unknown): number | null => (typeof input === 'number' ? input : null)
  const text = (input: unknown): string | null => (typeof input === 'string' ? input : null)
  return value.filter(isRecord).flatMap((entry) =>
    typeof entry.versionId === 'string'
      ? [
          {
            versionId: entry.versionId,
            laps: number(entry.laps) ?? 0,
            sessions: number(entry.sessions) ?? 0,
            bestLapSeconds: number(entry.bestLapSeconds),
            medianLapSeconds: number(entry.medianLapSeconds),
            fuelPerLapLiters: number(entry.fuelPerLapLiters),
            tyres: Array.isArray(entry.tyres)
              ? entry.tyres.filter(isRecord).map((tyre) => ({ front: text(tyre.front), rear: text(tyre.rear), laps: number(tyre.laps) ?? 0 }))
              : [],
          },
        ]
      : [],
  )
}

export const parseSetupSheet = (value: unknown): SetupSheet | null => {
  if (!isRecord(value)) return null
  const setup = parseItem(value.setup)
  const versionId = text(value.versionId)
  if (!setup || !versionId) return null
  const versions = Array.isArray(value.versions)
    ? value.versions.flatMap((version): SetupVersion[] => {
        if (!isRecord(version)) return []
        const id = text(version.id)
        const savedAt = text(version.savedAt)
        return id && savedAt ? [{ id, savedAt, isCurrent: version.isCurrent === true }] : []
      })
    : []
  const readings = Array.isArray(value.readings) ? value.readings.map(parseReading).filter((reading): reading is SetupReading => reading !== null) : []
  return { setup, versionId, readings, versions }
}

// ── The list ───────────────────────────────────────────────────────────────────────────

export type SetupSort = 'newest' | 'name'

/** What the list is narrowed to. An empty list of choices means "any". */
export type SetupFilters = {
  search: string
  carClass: string[]
  car: string[]
  track: string[]
  session: SetupSession[]
  style: SetupStyle[]
}

export const NO_FILTERS: SetupFilters = { search: '', carClass: [], car: [], track: [], session: [], style: [] }

export type FilterKey = Exclude<keyof SetupFilters, 'search'>

/** The filter chips, in the order they are shown. */
export const FILTERS: ReadonlyArray<{ key: FilterKey; label: string }> = [
  { key: 'carClass', label: 'Class' },
  { key: 'car', label: 'Car' },
  { key: 'track', label: 'Track' },
  { key: 'session', label: 'Session' },
  { key: 'style', label: 'Style' },
]

const valueOf = (setup: SetupItem, key: FilterKey): string | null => {
  switch (key) {
    case 'carClass':
      return setup.carClass
    case 'car':
      return setup.car
    case 'track':
      return setup.trackName
    case 'session':
      return setup.session
    case 'style':
      return setup.style
  }
}

/** Setups matching every filter, and the search in their name, car or track. */
export function filterSetups(setups: readonly SetupItem[], filters: SetupFilters): SetupItem[] {
  const words = filters.search.toLowerCase().split(/\s+/).filter(Boolean)
  return setups.filter((setup) => {
    for (const { key } of FILTERS) {
      const chosen: readonly string[] = filters[key]
      if (chosen.length > 0 && !chosen.includes(valueOf(setup, key) ?? '')) return false
    }
    const haystack = `${setup.name} ${setup.car} ${setup.trackName} ${setup.carClass ?? ''}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

/** The choices a filter chip offers, with how many setups each has: most first, then by name. */
export function filterChoices(setups: readonly SetupItem[], key: FilterKey): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>()
  for (const setup of setups) {
    const value = valueOf(setup, key)
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const order: readonly string[] | null = key === 'session' ? SESSIONS : key === 'style' ? STYLES : null
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => (order ? order.indexOf(a.value) - order.indexOf(b.value) : a.value.localeCompare(b.value)))
}

export const toggleFilter = (filters: SetupFilters, key: FilterKey, value: string): SetupFilters => {
  const chosen: readonly string[] = filters[key]
  const next = chosen.includes(value) ? chosen.filter((item) => item !== value) : [...chosen, value]
  return { ...filters, [key]: next }
}

export const hasFilters = (filters: SetupFilters): boolean => filters.search.trim() !== '' || FILTERS.some(({ key }) => filters[key].length > 0)

/** One car at one track, with its setups. */
export type SetupGroup = { key: string; car: string; trackName: string; carClass: string | null; setups: SetupItem[] }

const newer = (a: SetupItem, b: SetupItem) => b.savedAt.localeCompare(a.savedAt)
const byName = (a: SetupItem, b: SetupItem) => a.name.localeCompare(b.name, undefined, { numeric: true })

/** Setups grouped by car and track: newest group first, or by car then track. */
export function groupSetups(setups: readonly SetupItem[], sort: SetupSort): SetupGroup[] {
  const groups = new Map<string, SetupGroup>()
  for (const setup of setups) {
    const key = `${setup.car}\u0000${setup.trackName}`
    const group = groups.get(key) ?? { key, car: setup.car, trackName: setup.trackName, carClass: setup.carClass, setups: [] }
    group.setups.push(setup)
    groups.set(key, group)
  }
  const list = [...groups.values()]
  for (const group of list) group.setups.sort(sort === 'newest' ? newer : byName)
  return sort === 'newest'
    ? list.sort((a, b) => newer(a.setups[0], b.setups[0]))
    : list.sort((a, b) => a.car.localeCompare(b.car) || a.trackName.localeCompare(b.trackName))
}

/**
 * Compare's opening pair from `from` (or the newest setup): the next setup for the same car at
 * the same track, else the next one for the same car, else any other. Null with fewer than two.
 */
export function comparePair(setups: readonly SetupItem[], from: string | null = null): { first: SetupRef; second: SetupRef } | null {
  const sorted = [...setups].sort(newer)
  const first = sorted.find((setup) => setup.id === from) ?? sorted[0]
  if (!first) return null
  const others = sorted.filter((setup) => setup.id !== first.id)
  const second =
    others.find((setup) => setup.car === first.car && setup.trackName === first.trackName) ?? others.find((setup) => setup.car === first.car) ?? others[0]
  return second ? { first: { id: first.id, version: null }, second: { id: second.id, version: null } } : null
}

// ── One setup ──────────────────────────────────────────────────────────────────────────

/** One row of a block: an axle's two sides fold into one, `sides` set when they differ. */
export type SetupRow = { label: string; display: string; sides: [string, string] | null; steps: Array<number | null> }

export type SetupBlock = { title: string; rows: SetupRow[] }

const CORNER = /^(.+) (left|right)$/

/**
 * A tab's values in blocks ("Front", "Rear", "Gearbox"…), in the order the game wrote them. A
 * corner's value joins its axle ("Front left" + "Front right" → "Front"): one value when both
 * sides match, both ("left · right") when they don't.
 */
export function sheetBlocks(readings: readonly SetupReading[], tab: SetupTab): SetupBlock[] {
  const blocks = new Map<string, Map<string, { left: SetupReading | null; right: SetupReading | null; only: SetupReading | null }>>()
  for (const reading of readings) {
    if (reading.tab !== tab) continue
    const corner = CORNER.exec(reading.group)
    const title = corner ? corner[1] : reading.group
    const rows = blocks.get(title) ?? new Map()
    blocks.set(title, rows)
    const row = rows.get(reading.label) ?? { left: null, right: null, only: null }
    if (corner?.[2] === 'left') row.left = reading
    else if (corner?.[2] === 'right') row.right = reading
    else row.only = reading
    rows.set(reading.label, row)
  }

  return [...blocks].map(([title, rows]) => ({
    title,
    rows: [...rows].map(([label, { left, right, only }]): SetupRow => {
      if (only || !left || !right) {
        const reading = only ?? left ?? right
        return { label, display: reading?.display ?? '', sides: null, steps: [reading?.step ?? null] }
      }
      const same = left.display === right.display
      return {
        label,
        display: same ? left.display : `${left.display} · ${right.display}`,
        sides: same ? null : [left.display, right.display],
        steps: [left.step, right.step],
      }
    }),
  }))
}

// ── Compare ────────────────────────────────────────────────────────────────────────────

export type CompareRow = { label: string; first: string | null; second: string | null; differs: boolean; difference: string | null }

export type CompareBlock = { title: string; rows: CompareRow[] }

/** Two values differ when the game's steps do; without steps, when their words do. */
const rowsDiffer = (a: SetupRow | undefined, b: SetupRow | undefined): boolean => {
  if (!a || !b) return true
  const stepped = a.steps.every((step) => step !== null) && b.steps.every((step) => step !== null)
  return stepped ? a.steps.join() !== b.steps.join() : a.display !== b.display
}

const NUMBER = /^(-?\d+(?:\.\d+)?)\s*([^\d\s].*)?$/

/**
 * How far `first` is from `second`, in the values' own unit when both are one number with the
 * same unit ("+0.2 deg"), else in the game's steps ("+1 click"). Null when neither says.
 */
export function difference(first: SetupRow, second: SetupRow): string | null {
  const a = NUMBER.exec(first.display)
  const b = NUMBER.exec(second.display)
  if (!first.sides && !second.sides && a && b && (a[2] ?? '') === (b[2] ?? '')) {
    const decimals = Math.max(a[1].split('.')[1]?.length ?? 0, b[1].split('.')[1]?.length ?? 0)
    const delta = Number(a[1]) - Number(b[1])
    const unit = a[2] ? ` ${a[2]}` : ''
    return `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta).toFixed(decimals)}${unit}`
  }
  const [stepA] = first.steps
  const [stepB] = second.steps
  if (first.steps.length === 1 && second.steps.length === 1 && stepA !== null && stepB !== null && stepA !== stepB) {
    const clicks = stepA - stepB
    return `${clicks > 0 ? '+' : '−'}${Math.abs(clicks)} click${Math.abs(clicks) === 1 ? '' : 's'}`
  }
  return null
}

/** A tab of two setups side by side, block by block; `onlyDifferences` drops the rows that match. */
export function compareBlocks(first: readonly SetupReading[], second: readonly SetupReading[], tab: SetupTab, onlyDifferences: boolean): CompareBlock[] {
  const a = sheetBlocks(first, tab)
  const b = sheetBlocks(second, tab)
  const titles = [...new Set([...a.map((block) => block.title), ...b.map((block) => block.title)])]
  return titles
    .map((title) => {
      const left = a.find((block) => block.title === title)?.rows ?? []
      const right = b.find((block) => block.title === title)?.rows ?? []
      const labels = [...new Set([...left.map((row) => row.label), ...right.map((row) => row.label)])]
      const rows = labels.map((label): CompareRow => {
        const x = left.find((row) => row.label === label)
        const y = right.find((row) => row.label === label)
        const differs = rowsDiffer(x, y)
        return { label, first: x?.display ?? null, second: y?.display ?? null, differs, difference: differs && x && y ? difference(x, y) : null }
      })
      return { title, rows: onlyDifferences ? rows.filter((row) => row.differs) : rows }
    })
    .filter((block) => block.rows.length > 0)
}

/** How many rows differ on each tab. */
export function differenceCounts(first: readonly SetupReading[], second: readonly SetupReading[]): Record<SetupTab, number> {
  const count = (tab: SetupTab) => compareBlocks(first, second, tab, true).reduce((sum, block) => sum + block.rows.length, 0)
  return { Power: count('Power'), WheelsAndBrakes: count('WheelsAndBrakes'), Suspension: count('Suspension'), Dampers: count('Dampers'), ChassisAndAero: count('ChassisAndAero') }
}

// ── How a setup drove (the runs it was put on in Analysis) ─────────────────────────────

/** "9 laps in 2 sessions". */
export const lapsLine = (driven: SetupDriven): string =>
  `${driven.laps === 1 ? '1 lap' : `${driven.laps} laps`} in ${driven.sessions === 1 ? '1 session' : `${driven.sessions} sessions`}`

/** Every tyre choice it drove on, most laps first: "Medium, Soft front · Medium rear". */
export const tyresLine = (driven: SetupDriven): string =>
  driven.tyres.map((choice) => tyreText(choice.front, choice.rear)).filter((text): text is string => text !== null).join(', ') || '—'

export type DrivenRow = { label: string; first: string; second: string; difference: string }

/** The On track rows of compare: each side's figures and, where both have one, first minus second. */
export function drivenRows(first: SetupDriven, second: SetupDriven): DrivenRow[] {
  const time = (a: number | null, b: number | null) => (a !== null && b !== null ? formatGap(a - b) : '')
  const fuel = (a: number | null, b: number | null) => {
    if (a === null || b === null) return ''
    const value = Math.round((a - b) * 100) / 100
    return `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(2)} L`
  }
  const empty = (driven: SetupDriven, text: string) => (driven.laps === 0 ? '—' : text)
  return [
    { label: 'Best lap', first: formatLapSeconds(first.bestLapSeconds), second: formatLapSeconds(second.bestLapSeconds), difference: time(first.bestLapSeconds, second.bestLapSeconds) },
    { label: 'Median lap', first: formatLapSeconds(first.medianLapSeconds), second: formatLapSeconds(second.medianLapSeconds), difference: time(first.medianLapSeconds, second.medianLapSeconds) },
    { label: 'Laps', first: empty(first, lapsLine(first)), second: empty(second, lapsLine(second)), difference: '' },
    { label: 'Tyres', first: tyresLine(first), second: tyresLine(second), difference: '' },
    { label: 'Fuel per lap', first: fuelText(first.fuelPerLapLiters), second: fuelText(second.fuelPerLapLiters), difference: fuel(first.fuelPerLapLiters, second.fuelPerLapLiters) },
  ]
}

// ── Picking one ────────────────────────────────────────────────────────────────────────

const squash = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Whether a setup is for `car`. The game names the driven car with more than the model (a team,
 * a number), so either name containing the other counts. Only ever used to order a list.
 */
export function sameCar(setupCar: string, car: string | null): boolean {
  if (car === null) return false
  const a = squash(setupCar)
  const b = squash(car)
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a))
}

/** Setups matching every word of `query` in their name, car or track: `car`'s first, then newest first; at most `limit`. */
export function searchSetups(setups: readonly SetupItem[], query: string, car: string | null, limit = 100): SetupItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return setups
    .filter((setup) => words.every((word) => `${setup.name} ${setup.car} ${setup.trackName}`.toLowerCase().includes(word)))
    .sort((x, y) => Number(sameCar(y.car, car)) - Number(sameCar(x.car, car)) || y.savedAt.localeCompare(x.savedAt))
    .slice(0, limit)
}

// ── Words ──────────────────────────────────────────────────────────────────────────────

const DAY = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
const DAY_TIME = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

/** "Oct 30". */
export const shortDate = (iso: string): string => DAY.format(new Date(iso))

/** "Oct 30, 19:12". */
export const dateTime = (iso: string): string => DAY_TIME.format(new Date(iso))

/** "Saved Oct 30 · 3 versions". */
export const savedLine = (setup: SetupItem): string =>
  `Saved ${shortDate(setup.savedAt)}${setup.versions > 1 ? ` · ${setup.versions} versions` : ''}`

/** "Porsche 963 · Spa". */
export const carAtTrack = (setup: Pick<SetupItem, 'car' | 'trackName'>): string => `${setup.car} · ${setup.trackName}`
