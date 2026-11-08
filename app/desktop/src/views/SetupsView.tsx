import { useRef, useState } from 'react'
import { ArrowUpDown, Check, ChevronDown, ChevronRight, GitCompareArrows, ListFilter } from 'lucide-react'
import { PageHeader } from '../shell/PageHeader'
import { usePageUp } from '../shell/pageUp'
import { MenuLayer } from './DashesMenus'
import type { MenuAnchor } from './DashesMenus'
import {
  FILTERS,
  LIST_PAGE,
  NO_FILTERS,
  comparePair,
  filterChoices,
  filterSetups,
  groupSetups,
  hasFilters,
  savedLine,
  toggleFilter,
} from './SetupsDomain'
import type { SetupFilters, SetupItem, SetupRef, SetupSort, SetupsPage } from './SetupsDomain'
import { FilterChip } from './FilterChip'
import { ComparePage, SetupPage, SetupTags } from './SetupsPages'
import { useSetupLibrary } from './useSetups'
import './SetupsView.css'

/**
 * Setups: the setups Le Mans Ultimate stores, read from its setup folder (SetupsDomain.ts). View
 * only — values are changed in the game. Three pages over the whole content width: the list
 * (search, filter chips, grouped by car and track), one setup opened from it with its versions,
 * and two setups compared (SetupsPages.tsx). Which page is open, the filters and the sort are
 * the only local state; the list is fetched again each time it is shown.
 */
export function SetupsView() {
  const [page, setPage] = useState<SetupsPage>(LIST_PAGE)
  const [shown, setShown] = useState(0)
  const library = useSetupLibrary(shown)
  usePageUp(page.kind === 'list' ? null : 'All setups', () => toList())
  const setups = library.kind === 'ready' ? library.setups : []

  function toList() {
    setPage(LIST_PAGE)
    setShown((count) => count + 1)
  }

  const openCompare = (from: string | null) => {
    const pair = comparePair(setups, from)
    if (pair) setPage({ kind: 'compare', ...pair })
  }

  if (page.kind === 'setup') {
    return (
      <SetupPage
        setup={page.setup}
        canCompare={setups.length > 1}
        onBack={toList}
        onVersion={(version) => setPage({ kind: 'setup', setup: { id: page.setup.id, version } })}
        onCompare={(first: SetupRef, second: SetupRef | null) => {
          const pair = comparePair(setups, first.id)
          const other = second ?? pair?.second
          if (other) setPage({ kind: 'compare', first, second: other })
        }}
      />
    )
  }

  if (page.kind === 'compare') {
    return (
      <ComparePage
        first={page.first}
        second={page.second}
        setups={setups}
        onBack={toList}
        onPick={(first, second) => setPage({ kind: 'compare', first, second })}
      />
    )
  }

  return (
    <div className="setups-page">
      <PageHeader title="Setups">
        <button type="button" className="button" disabled={setups.length < 2} onClick={() => openCompare(null)}>
          <GitCompareArrows /> Compare…
        </button>
      </PageHeader>
      {library.kind === 'loading' ? (
        <>
          <div className="card skeleton setups-bar-skeleton" />
          <div className="card skeleton setups-list-skeleton" />
        </>
      ) : library.kind === 'unavailable' ? (
        <div className="card setups-empty">
          <div className="empty-state">
            <h2>No Le Mans Ultimate setups found</h2>
            <p>Sprint looks for the game in your Steam libraries and reads the setups saved in its garage.</p>
          </div>
        </div>
      ) : library.kind === 'failed' ? (
        <div className="card setups-empty">
          <div className="empty-state">
            <h2>The setups could not be read</h2>
            <p>Sprint could not reach the game's setup folder just now.</p>
            <button type="button" className="button" onClick={() => setShown((count) => count + 1)}>
              Try again
            </button>
          </div>
        </div>
      ) : (
        <SetupList setups={setups} onOpen={(id) => setPage({ kind: 'setup', setup: { id, version: null } })} />
      )}
    </div>
  )
}

const SORTS: ReadonlyArray<{ id: SetupSort; label: string }> = [
  { id: 'newest', label: 'Newest first' },
  { id: 'name', label: 'Car and track' },
]

/** The list: search, the filter chips and sort, then every setup grouped by car and track. */
function SetupList({ setups, onOpen }: { setups: SetupItem[]; onOpen: (id: string) => void }) {
  const [filters, setFilters] = useState<SetupFilters>(NO_FILTERS)
  const [sort, setSort] = useState<SetupSort>('newest')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [sortMenu, setSortMenu] = useState<MenuAnchor | null>(null)
  const sortButton = useRef<HTMLButtonElement | null>(null)

  if (setups.length === 0) {
    return (
      <div className="card setups-empty">
        <div className="empty-state">
          <h2>No setups saved yet</h2>
          <p>Save a setup in the game's garage and it shows up here.</p>
        </div>
      </div>
    )
  }

  const matching = filterSetups(setups, filters)
  const groups = groupSetups(matching, sort)
  const filtered = hasFilters(filters)
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
          placeholder="Search setup, car or track"
          aria-label="Search setups"
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
        />
        <span className="setups-count">
          {filtered ? `${matching.length} of ${setups.length} setups` : `${setups.length} setups in Le Mans Ultimate`}
        </span>
        <button
          ref={sortButton}
          type="button"
          className="button subtle"
          aria-haspopup="menu"
          aria-expanded={sortMenu !== null}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            setSortMenu({ x: box.right - 180, y: box.bottom + 4 })
          }}
        >
          <ArrowUpDown /> {SORTS.find((option) => option.id === sort)?.label}
        </button>
        {sortMenu && (
          <MenuLayer
            anchor={sortMenu}
            label="Sort"
            width={180}
            onClose={() => {
              setSortMenu(null)
              sortButton.current?.focus()
            }}
          >
            {SORTS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={sort === option.id}
                className="menu-item"
                onClick={() => {
                  setSort(option.id)
                  setSortMenu(null)
                  sortButton.current?.focus()
                }}
              >
                <span className="setups-menu-check">{sort === option.id && <Check />}</span>
                {option.label}
              </button>
            ))}
          </MenuLayer>
        )}
      </div>

      <div className="setups-chips" role="group" aria-label="Filters">
        <ListFilter className="setups-chips-icon" aria-hidden="true" />
        {FILTERS.map((filter) => (
          <FilterChip
            key={filter.key}
            label={filter.label}
            choices={filterChoices(setups, filter.key)}
            chosen={filters[filter.key]}
            onToggle={(value) => setFilters(toggleFilter(filters, filter.key, value))}
            onClear={() => setFilters({ ...filters, [filter.key]: [] })}
          />
        ))}
        {filtered && (
          <button type="button" className="button subtle setups-clear" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="card setups-empty">
          <div className="empty-state">
            <h2>No setups match</h2>
            <p>Try another search, or clear the filters.</p>
            <button type="button" className="button" onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <section className="card list-card setups-groups" aria-label="Setups">
          {groups.map((group) => {
            const open = !collapsed.has(group.key)
            return (
              <div key={group.key} className="setups-group">
                <button type="button" className="setups-group-head" aria-expanded={open} onClick={() => toggleGroup(group.key)}>
                  {open ? <ChevronDown /> : <ChevronRight />}
                  <span className="setups-group-text">
                    <strong>
                      {group.car} · {group.trackName}
                    </strong>
                    <span className="setups-dim">
                      {group.carClass ? `${group.carClass} · ` : ''}
                      {group.setups.length === 1 ? '1 setup' : `${group.setups.length} setups`}
                    </span>
                  </span>
                </button>
                {open && (
                  <div className="list-rows">
                    {group.setups.map((setup) => (
                      <button key={setup.id} type="button" className="list-row setups-row" onClick={() => onOpen(setup.id)}>
                        <span className="setups-row-session">{setup.session && <span className="setups-tag">{setup.session}</span>}</span>
                        <span className="setups-row-name">
                          <strong>{setup.name}</strong>
                          <span className="setups-dim">{savedLine(setup)}</span>
                        </span>
                        <SetupTags setup={setup} session={false} />
                        <ChevronRight className="setups-row-chevron" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )}
    </>
  )
}
