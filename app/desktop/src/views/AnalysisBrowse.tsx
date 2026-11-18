import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Clock, ListFilter } from 'lucide-react'
import type { CorpusSession } from './AnalysisDomain'
import { dayLabel, formatGap, formatLapSeconds } from './AnalysisDomain'
import {
  CLASS_PREVIEW,
  DATE_RANGES,
  LAYOUT_PREVIEW,
  NO_BROWSE_FILTERS,
  browseCars,
  browseSessions,
  circuitChoices,
  circuitCountries,
  circuitsOf,
  classSections,
  dateChoices,
  gameName,
  gamesOf,
  gapOnLayout,
  hasBrowseFilters,
  kindChoices,
  recentCars,
} from './AnalysisBrowseDomain'
import type { BrowseCar, BrowseCircuit, BrowseFilters, BrowseLayout } from './AnalysisBrowseDomain'
import { kindLabel, sessionLine, sessionTitle, sessionsIn } from './AnalysisSessions'
import { ClassTag, Flag, MakerLogo } from './CarBadges'
import { classTone } from '../carMarks'
import { FilterChip } from './FilterChip'
import { SessionChip } from './SessionChip'
import './SetupsView.css'
import './AnalysisBrowse.css'

const REGIONS = new Intl.DisplayNames(['en'], { type: 'region' })

/**
 * Analysis's first page: pick a car, then see its sessions. On the left the game, your recent
 * cars and every car by class (each class closed until opened); on the right the picked car's
 * circuits, each closed until opened, its layouts apart with their own best. Built for years of
 * racing: a class shows its most driven cars and "Show more", a layout its newest sessions and
 * "Show all". The search and the Track, Date and Session filters narrow both panes. Only your
 * sessions; shared laps have their own list (AnalysisSessionList). What is picked and open is
 * the only local state; the sums are AnalysisBrowseDomain.ts.
 */
export function AnalysisBrowse({ sessions, onOpen }: { sessions: readonly CorpusSession[]; onOpen: (sessionId: string) => void }) {
  const [now] = useState(() => Date.now())
  const [filters, setFilters] = useState<BrowseFilters>(NO_BROWSE_FILTERS)
  const [game, setGame] = useState<string | null>(null)
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: string) => {
    const next = new Set(open)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setOpen(next)
  }

  const mine = sessionsIn(sessions, 'mine')
  const games = gamesOf(mine)
  const shownGame = game !== null && games.includes(game) ? game : (games[0] ?? null)
  const inGame = mine.filter((session) => session.context.game === shownGame)
  const countries = circuitCountries(inGame)
  const matching = browseSessions(inGame, filters, now)
  const cars = browseCars(matching)
  const picked = cars.find((car) => car.key === pickedKey) ?? cars[0] ?? null
  const laps = matching.reduce((sum, session) => sum + session.lapCount, 0)
  const toggleIn = (key: 'circuits' | 'kinds', value: string) =>
    setFilters({ ...filters, [key]: filters[key].includes(value) ? filters[key].filter((item) => item !== value) : [...filters[key], value] })
  const dateLabel = DATE_RANGES.find((range) => range.id === filters.date)?.label

  if (mine.length === 0) {
    return (
      <div className="card setups-empty">
        <div className="empty-state">
          <h2>No sessions of your own yet</h2>
          <p>Drive a session, or import the game's results, and it appears here. Laps others sent you are under Shared.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="setups-bar">
        <input
          type="search"
          className="setups-search"
          placeholder="Search car or track"
          aria-label="Search sessions"
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        />
        <span className="setups-count tabular">
          {plural(matching.length, 'session', 'sessions')} · {plural(laps, 'lap', 'laps')}
        </span>
      </div>
      <div className="setups-chips" role="group" aria-label="Filters">
        <ListFilter className="setups-chips-icon" aria-hidden="true" />
        <FilterChip
          label="Track"
          choices={circuitChoices(inGame, filters, now)}
          chosen={filters.circuits}
          onToggle={(value) => toggleIn('circuits', value)}
          onClear={() => setFilters({ ...filters, circuits: [] })}
          icon={(value) => <Flag country={countries.get(value) ?? null} />}
        />
        <FilterChip
          label="Date"
          single
          choices={dateChoices(inGame, filters, now)}
          chosen={dateLabel ? [dateLabel] : []}
          onToggle={(value) => setFilters({ ...filters, date: DATE_RANGES.find((range) => range.label === value)?.id ?? null })}
          onClear={() => setFilters({ ...filters, date: null })}
        />
        <FilterChip
          label="Session"
          choices={kindChoices(inGame, filters, now)}
          chosen={filters.kinds}
          onToggle={(value) => toggleIn('kinds', value)}
          onClear={() => setFilters({ ...filters, kinds: [] })}
        />
        {hasBrowseFilters(filters) && (
          <button type="button" className="button subtle setups-clear" onClick={() => setFilters(NO_BROWSE_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {picked === null ? (
        <div className="card setups-empty">
          <div className="empty-state">
            <h2>No sessions match</h2>
            <p>Try another search, or clear the filters.</p>
            <button type="button" className="button" onClick={() => setFilters(NO_BROWSE_FILTERS)}>
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <div className="browse">
          <nav className="card list-card browse-cars" aria-label="Cars">
            <div className="browse-game">
              {games.length > 1 ? (
                <span className="segmented" role="radiogroup" aria-label="Game">
                  {games.map((candidate) => (
                    <button key={candidate} type="button" role="radio" className="segmented-item" aria-checked={candidate === shownGame} onClick={() => setGame(candidate)}>
                      {gameName(candidate)}
                    </button>
                  ))}
                </span>
              ) : (
                <span className="browse-game-name">
                  <GameLogo game={shownGame ?? ''} />
                  <strong>{gameName(shownGame ?? '')}</strong>
                </span>
              )}
              <span className="setups-dim">{plural(cars.length, 'car', 'cars')}</span>
            </div>
            <Recent cars={recentCars(cars)} picked={picked} onPick={setPickedKey} />
            {classSections(cars, (car) => car.sessions.length).map((section) => {
              const key = `class:${section.tag}`
              const more = `more:${section.tag}`
              const shown = open.has(more) ? section.cars : section.cars.slice(0, CLASS_PREVIEW)
              return (
                <div key={section.tag} className={`browse-class ${classTone(section.tag)}`}>
                  <button type="button" className="browse-pane-head" aria-expanded={open.has(key)} onClick={() => toggle(key)}>
                    {open.has(key) ? <ChevronDown /> : <ChevronRight />}
                    <ClassTag tag={section.tag} />
                    <span className="browse-pane-head-name">{section.name}</span>
                    <span className="browse-pane-head-count tabular">{plural(section.cars.length, 'car', 'cars')}</span>
                  </button>
                  {open.has(key) && (
                    <div className="list-rows browse-class-cars" role="listbox" aria-label={section.name}>
                      {shown.map((car) => (
                        <CarRow key={car.key} car={car} picked={car.key === picked.key} onPick={setPickedKey} tagged={false} />
                      ))}
                      {section.cars.length > shown.length && (
                        <button type="button" className="browse-more" onClick={() => toggle(more)}>
                          Show {section.cars.length - shown.length} more
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
          <CarSessions car={picked} open={open} onToggle={toggle} onOpen={onOpen} />
        </div>
      )}
    </>
  )
}

const plural = (count: number, one: string, many: string) => `${count.toLocaleString()} ${count === 1 ? one : many}`

/** The game's badge: its initials ("LMU"), until Sprint ships the game's logo. */
function GameLogo({ game }: { game: string }) {
  const initials = gameName(game)
    .split(/\s+/)
    .map((word) => word.slice(0, 1))
    .join('')
    .slice(0, 3)
  return (
    <span className="logo-badge game" aria-hidden="true">
      {initials}
    </span>
  )
}

/** One car to pick. `when` adds the day last driven (Recent); `tagged={false}` drops the class tag where a class header already shows it. */
function CarRow({
  car,
  picked,
  onPick,
  when = false,
  tagged = true,
}: {
  car: BrowseCar
  picked: boolean
  onPick: (key: string) => void
  when?: boolean
  tagged?: boolean
}) {
  return (
    <button type="button" role="option" aria-selected={picked} className="list-row browse-car" onClick={() => onPick(car.key)}>
      <MakerLogo make={car.make} />
      <span className="setups-row-name">
        <strong>{car.model}</strong>
        <span className="setups-dim">
          {when ? `${dayLabel(car.sessions[0].startedAt)} · ` : ''}
          {plural(car.sessions.length, 'session', 'sessions')}
        </span>
      </span>
      {tagged && <ClassTag tag={car.classTag} />}
    </button>
  )
}

/** The newest few cars, whichever class they are in. */
function Recent({ cars, picked, onPick }: { cars: readonly BrowseCar[]; picked: BrowseCar; onPick: (key: string) => void }) {
  if (cars.length === 0) return null
  return (
    <div className="browse-recent">
      <div className="browse-caption">
        <Clock aria-hidden="true" /> Recent
      </div>
      <div className="list-rows" role="listbox" aria-label="Recent">
        {cars.map((car) => (
          <CarRow key={car.key} car={car} picked={car.key === picked.key} onPick={onPick} when />
        ))}
      </div>
    </div>
  )
}

/** The picked car: its head, then its circuits newest first, each closed until opened. */
function CarSessions({ car, open, onToggle, onOpen }: { car: BrowseCar; open: ReadonlySet<string>; onToggle: (key: string) => void; onOpen: (sessionId: string) => void }) {
  const circuits = circuitsOf(car.sessions)
  const laps = car.sessions.reduce((sum, session) => sum + session.lapCount, 0)
  return (
    <div className="browse-detail">
      <div className="browse-detail-head">
        <MakerLogo make={car.make} />
        <h2 className="browse-detail-title">{car.model}</h2>
        <ClassTag tag={car.classTag} />
        <span className="setups-dim">
          {plural(car.sessions.length, 'session', 'sessions')} · {plural(laps, 'lap', 'laps')} · {plural(circuits.length, 'track', 'tracks')}
        </span>
      </div>
      <section className="card list-card setups-groups" aria-label={`${car.model} sessions`}>
        {circuits.map((circuit) => (
          <Circuit key={circuit.id} carKey={car.key} circuit={circuit} open={open} onToggle={onToggle} onOpen={onOpen} />
        ))}
      </section>
    </div>
  )
}

function Circuit({
  carKey,
  circuit,
  open,
  onToggle,
  onOpen,
}: {
  carKey: string
  circuit: BrowseCircuit
  open: ReadonlySet<string>
  onToggle: (key: string) => void
  onOpen: (sessionId: string) => void
}) {
  const key = `circuit:${carKey}:${circuit.id}`
  const isOpen = open.has(key)
  const single = circuit.layouts.length === 1 ? circuit.layouts[0] : null
  const line = [
    circuit.country ? REGIONS.of(circuit.country) : null,
    single ? null : `${circuit.layouts.length} layouts`,
    plural(circuit.sessionCount, 'session', 'sessions'),
  ].filter(Boolean)
  return (
    <div className="setups-group">
      <button type="button" className="setups-group-head browse-circuit-head" aria-expanded={isOpen} onClick={() => onToggle(key)}>
        {isOpen ? <ChevronDown /> : <ChevronRight />}
        <Flag country={circuit.country} />
        <span className="setups-group-text">
          <strong>{circuit.name}</strong>
          <span className="setups-dim">{line.join(' · ')}</span>
        </span>
        {single && <Best seconds={single.bestSeconds} />}
      </button>
      {isOpen &&
        circuit.layouts.map((layout) => (
          <Layout key={layout.trackCourse} layout={layout} headed={single === null} moreKey={`${key}:${layout.trackCourse}`} open={open} onToggle={onToggle} onOpen={onOpen} />
        ))}
    </div>
  )
}

/** A layout's newest sessions and "Show all"; under its own heading when the circuit has several. */
function Layout({
  layout,
  headed,
  moreKey,
  open,
  onToggle,
  onOpen,
}: {
  layout: BrowseLayout
  headed: boolean
  moreKey: string
  open: ReadonlySet<string>
  onToggle: (key: string) => void
  onOpen: (sessionId: string) => void
}) {
  const shown = open.has(moreKey) ? layout.sessions : layout.sessions.slice(0, LAYOUT_PREVIEW)
  return (
    <div>
      {headed && (
        <div className="browse-layout-head">
          <strong>{layout.label}</strong>
          <Best seconds={layout.bestSeconds} />
        </div>
      )}
      <div className="list-rows">
        {shown.map((session) => (
          <SessionRow key={session.id} session={session} layout={layout} onOpen={onOpen} />
        ))}
        {layout.sessions.length > shown.length && (
          <button type="button" className="browse-more indent" onClick={() => onToggle(moreKey)}>
            Show all {layout.sessions.length} sessions
          </button>
        )}
      </div>
    </div>
  )
}

function Best({ seconds }: { seconds: number | null }): ReactNode {
  if (seconds === null) return null
  return (
    <span className="analysis-group-best">
      <span className="setups-dim">Your best</span>
      <strong className="tabular">{formatLapSeconds(seconds)}</strong>
    </span>
  )
}

function SessionRow({ session, layout, onOpen }: { session: CorpusSession; layout: BrowseLayout; onOpen: (sessionId: string) => void }) {
  const gap = gapOnLayout(session, layout)
  return (
    <button type="button" className="list-row analysis-session-row" onClick={() => onOpen(session.id)}>
      <span className="setups-row-session">
        <SessionChip kind={kindLabel(session)} />
      </span>
      <span className="setups-row-name">
        <strong>{sessionTitle(session)}</strong>
        <span className="setups-dim">{sessionLine(session)}</span>
      </span>
      <span className="analysis-session-tag">
        {session.origin === 'Imported' && <span className="chip chip-muted">{session.tracedLapCount === 0 ? 'Imported · times only' : 'Imported'}</span>}
      </span>
      <span className={`analysis-session-gap tabular${gap === 0 ? ' best' : ''}`}>{gap === null ? '' : gap === 0 ? 'Your best' : formatGap(gap)}</span>
      <span className="analysis-session-best tabular">{formatLapSeconds(session.bestLapSeconds)}</span>
      <ChevronRight className="setups-row-chevron" />
    </button>
  )
}
