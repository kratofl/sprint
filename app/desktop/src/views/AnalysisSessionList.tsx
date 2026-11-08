import { useState } from 'react'
import { ChevronDown, ChevronRight, ListFilter } from 'lucide-react'
import { formatGap, formatLapSeconds } from './AnalysisDomain'
import type { CorpusSession } from './AnalysisDomain'
import {
  NO_SESSION_FILTERS,
  SESSION_FILTERS,
  filterSessions,
  gapToYourBest,
  groupLine,
  groupSessions,
  groupShared,
  hasSessionFilters,
  kindLabel,
  sessionFilterChoices,
  sessionLine,
  sessionTitle,
  sessionsIn,
  sharedStanding,
  toggleSessionFilter,
} from './AnalysisSessions'
import type { ListScope, SessionFilters, SessionGroup, SharedPerson } from './AnalysisSessions'
import { FilterChip } from './FilterChip'
import { FriendBadge, shortDay } from './OnTrackPages'
import './SetupsView.css'

/**
 * Analysis's first page, in one of two lists that never mix (the toolbar's Mine | Shared): your
 * sessions grouped by car and track (AnalysisSessions.ts), the way Setups lists setups, with your
 * best there and how far each session was off it — or the laps others shared with you, under who
 * sent them, each against your best there. The search, filters and collapsed groups are the only
 * local state.
 */
export function SessionList({ sessions, scope, onOpen }: { sessions: readonly CorpusSession[]; scope: ListScope; onOpen: (sessionId: string) => void }) {
  const [filters, setFilters] = useState<SessionFilters>(NO_SESSION_FILTERS)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  const listed = sessionsIn(sessions, scope)
  const matching = filterSessions(listed, filters)
  const groups = groupSessions(matching)
  const people = groupShared(matching)
  const filtered = hasSessionFilters(filters)
  // Shared laps are all "Shared" and in someone else's classes: car and track narrow them.
  const chips = scope === 'shared' ? SESSION_FILTERS.filter((filter) => filter.key === 'car' || filter.key === 'track') : SESSION_FILTERS
  const noun = scope === 'shared' ? ['shared lap', 'shared laps'] : ['session', 'sessions']
  const toggleGroup = (key: string) => {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsed(next)
  }

  return (
    <>
      <div className="setups-bar">
        <input
          type="search"
          className="setups-search"
          placeholder={scope === 'shared' ? 'Search name, car or track' : 'Search session, car or track'}
          aria-label={scope === 'shared' ? 'Search shared laps' : 'Search sessions'}
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        />
        <span className="setups-count">
          {filtered ? `${matching.length} of ${listed.length} ${noun[1]}` : listed.length === 1 ? `1 ${noun[0]}` : `${listed.length} ${noun[1]}`}
        </span>
      </div>

      <div className="setups-chips" role="group" aria-label="Filters">
        <ListFilter className="setups-chips-icon" aria-hidden="true" />
        {chips.map((filter) => (
          <FilterChip
            key={filter.key}
            label={filter.label}
            choices={sessionFilterChoices(listed, filter.key)}
            chosen={filters[filter.key]}
            onToggle={(value) => setFilters(toggleSessionFilter(filters, filter.key, value))}
            onClear={() => setFilters({ ...filters, [filter.key]: [] })}
          />
        ))}
        {filtered && (
          <button type="button" className="button subtle setups-clear" onClick={() => setFilters(NO_SESSION_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {listed.length === 0 && scope === 'shared' ? (
        <div className="card setups-empty">
          <div className="empty-state">
            <h2>No shared laps yet</h2>
            <p>When someone sends you a lap file, open it with Import… and it appears here.</p>
          </div>
        </div>
      ) : matching.length === 0 ? (
        <div className="card setups-empty">
          <div className="empty-state">
            <h2>No sessions match</h2>
            <p>Try another search, or clear the filters.</p>
            <button type="button" className="button" onClick={() => setFilters(NO_SESSION_FILTERS)}>
              Clear filters
            </button>
          </div>
        </div>
      ) : scope === 'shared' ? (
        <section className="card list-card setups-groups" aria-label="Shared laps">
          {people.map((person) => (
            <Person key={person.name} person={person} sessions={sessions} open={!collapsed.has(person.name)} onToggle={() => toggleGroup(person.name)} onOpen={onOpen} />
          ))}
        </section>
      ) : (
        <section className="card list-card setups-groups" aria-label="Sessions">
          {groups.map((group) => (
            <Group key={group.key} group={group} open={!collapsed.has(group.key)} onToggle={() => toggleGroup(group.key)} onOpen={onOpen} />
          ))}
        </section>
      )}
    </>
  )
}

function Group({ group, open, onToggle, onOpen }: { group: SessionGroup; open: boolean; onToggle: () => void; onOpen: (sessionId: string) => void }) {
  return (
    <div className="setups-group">
      <button type="button" className="setups-group-head" aria-expanded={open} onClick={onToggle}>
        {open ? <ChevronDown /> : <ChevronRight />}
        <span className="setups-group-text">
          <strong>
            {group.car} · {group.track}
          </strong>
          <span className="setups-dim">{groupLine(group)}</span>
        </span>
        {group.yourBestSeconds !== null && (
          <span className="analysis-group-best">
            <span className="setups-dim">Your best</span>
            <strong className="tabular">{formatLapSeconds(group.yourBestSeconds)}</strong>
          </span>
        )}
      </button>
      {open && (
        <div className="list-rows">
          {group.sessions.map((session) => {
            const gap = gapToYourBest(session, group)
            return (
              <button key={session.id} type="button" className="list-row analysis-session-row" onClick={() => onOpen(session.id)}>
                <span className="setups-row-session">
                  <span className="setups-tag">{kindLabel(session)}</span>
                </span>
                <span className="setups-row-name">
                  <strong>{sessionTitle(session)}</strong>
                  <span className="setups-dim">{sessionLine(session)}</span>
                </span>
                <span className="analysis-session-tag">
                  {session.origin === 'Imported' && <span className="setups-tag">{session.tracedLapCount === 0 ? 'Imported · times only' : 'Imported'}</span>}
                </span>
                <span className={`analysis-session-gap tabular${gap === 0 ? ' best' : ''}`}>{gap === null ? '' : gap === 0 ? 'Your best' : formatGap(gap)}</span>
                <span className="analysis-session-best tabular">{formatLapSeconds(session.bestLapSeconds)}</span>
                <ChevronRight className="setups-row-chevron" />
              </button>
            )
          })}
        </div>
      )}
    </div>
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
