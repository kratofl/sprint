import { useState } from 'react'
import { ChevronDown, ChevronRight, ListFilter } from 'lucide-react'
import { formatLapSeconds } from './AnalysisDomain'
import type { CorpusSession } from './AnalysisDomain'
import {
  NO_SESSION_FILTERS,
  SESSION_FILTERS,
  filterSessions,
  groupShared,
  hasSessionFilters,
  sessionBadges,
  sessionFilterChoices,
  sessionsIn,
  sharedStanding,
  toggleSessionFilter,
} from './AnalysisSessions'
import type { SessionFilters, SharedPerson } from './AnalysisSessions'
import { Flag, MakerLogo } from './CarBadges'
import { FilterChip } from './FilterChip'
import { FriendBadge, shortDay } from './OnTrackPages'
import './SetupsView.css'

// Shared laps are all "Shared" and in someone else's classes: car and track narrow them.
const SHARED_FILTERS = SESSION_FILTERS.filter((filter) => filter.key === 'car' || filter.key === 'track')

/**
 * Analysis's Shared list (the toolbar's Mine | Shared; your own sessions are AnalysisBrowse): the
 * laps others shared with you, under who sent them, each against your best there. Every person
 * starts closed. The search, filters and open people are the only local state.
 */
export function SharedList({ sessions, onOpen }: { sessions: readonly CorpusSession[]; onOpen: (sessionId: string) => void }) {
  const [filters, setFilters] = useState<SessionFilters>(NO_SESSION_FILTERS)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const listed = sessionsIn(sessions, 'shared')
  const matching = filterSessions(listed, filters)
  const filtered = hasSessionFilters(filters)
  const badges = sessionBadges(listed)
  const toggle = (name: string) => {
    const next = new Set(expanded)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setExpanded(next)
  }

  return (
    <>
      <div className="setups-bar">
        <input
          type="search"
          className="setups-search"
          placeholder="Search name, car or track"
          aria-label="Search shared laps"
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        />
        <span className="setups-count">
          {filtered ? `${matching.length} of ${listed.length} shared laps` : listed.length === 1 ? '1 shared lap' : `${listed.length} shared laps`}
        </span>
      </div>

      <div className="setups-chips" role="group" aria-label="Filters">
        <ListFilter className="setups-chips-icon" aria-hidden="true" />
        {SHARED_FILTERS.map((filter) => (
          <FilterChip
            key={filter.key}
            label={filter.label}
            choices={sessionFilterChoices(listed, filter.key, filters)}
            chosen={filters[filter.key]}
            onToggle={(value) => setFilters(toggleSessionFilter(filters, filter.key, value))}
            onClear={() => setFilters({ ...filters, [filter.key]: [] })}
            icon={filter.key === 'car' ? (value) => <MakerLogo make={badges.make.get(value) ?? null} small /> : (value) => <Flag country={badges.country.get(value) ?? null} />}
          />
        ))}
        {filtered && (
          <button type="button" className="button subtle setups-clear" onClick={() => setFilters(NO_SESSION_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {listed.length === 0 ? (
        <div className="card setups-empty">
          <div className="empty-state">
            <h2>No shared laps yet</h2>
            <p>When someone sends you a lap file, open it with Import… and it appears here.</p>
          </div>
        </div>
      ) : matching.length === 0 ? (
        <div className="card setups-empty">
          <div className="empty-state">
            <h2>No shared laps match</h2>
            <p>Try another search, or clear the filters.</p>
            <button type="button" className="button" onClick={() => setFilters(NO_SESSION_FILTERS)}>
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <section className="card list-card setups-groups" aria-label="Shared laps">
          {groupShared(matching).map((person) => (
            <Person key={person.name} person={person} sessions={sessions} open={expanded.has(person.name)} onToggle={() => toggle(person.name)} onOpen={onOpen} />
          ))}
        </section>
      )}
    </>
  )
}

/** Someone who shared laps with you, and each of their laps against your best with that car there. */
function Person({
  person,
  sessions,
  open,
  onToggle,
  onOpen,
}: {
  person: SharedPerson
  /** Every session, yours included: what each shared lap is measured against. */
  sessions: readonly CorpusSession[]
  open: boolean
  onToggle: () => void
  onOpen: (sessionId: string) => void
}) {
  const count = person.sessions.length
  return (
    <div className="setups-group">
      <button type="button" className="setups-group-head" aria-expanded={open} onClick={onToggle}>
        {open ? <ChevronDown /> : <ChevronRight />}
        <FriendBadge name={person.name} />
        <span className="setups-group-text">
          <strong>{person.name}</strong>
          <span className="setups-dim">{count === 1 ? '1 lap shared with you' : `${count} laps shared with you`}</span>
        </span>
      </button>
      {open && (
        <div className="list-rows">
          {person.sessions.map((session) => (
            <button key={session.id} type="button" className="list-row analysis-shared-row" onClick={() => onOpen(session.id)}>
              <span className="setups-row-name">
                <strong>
                  {session.context.carModel || 'Unknown car'} · {session.context.trackCourse || 'Unknown track'}
                </strong>
                <span className="setups-dim">Shared {shortDay(session.startedAt)}</span>
              </span>
              <span className="analysis-session-gap">{sharedStanding(session, sessions)}</span>
              <span className="analysis-session-best tabular">{formatLapSeconds(session.bestLapSeconds)}</span>
              <ChevronRight className="setups-row-chevron" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
