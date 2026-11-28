import { useRef, useState } from 'react'
import { ArrowUpDown, Check, ChevronDown, ChevronRight, GitCompareArrows, ListFilter, X } from 'lucide-react'
import type { SprintCommand } from '../bridge'
import { useExplorerShown } from '../shell/Explorer'
import { PageHeader } from '../shell/PageHeader'
import { usePageUp } from '../shell/pageUp'
import { MenuLayer, type MenuAnchor } from '../shell/Menu'
import {
  FILTERS,
  LIST_PAGE,
  NO_FILTERS,
  buildTagSetup,
  circuitCountries,
  comparePair,
  filterChoices,
  filterSetups,
  hasFilters,
  savedLine,
  setupCars,
  setupCircuits,
  toggleFilter,
} from './SetupsDomain'
import type { SetupCar, SetupCircuit, SetupFilters, SetupItem, SetupRef, SetupSort, SetupsPage, TagSetup } from './SetupsDomain'
import { ClassTag, Flag, MakerLogo } from './CarBadges'
import { classTone } from '../carMarks'
import { classSections } from './AnalysisBrowseDomain'
import { FilterChip } from './FilterChip'
import { ComparePage, SetupPage, SetupTags } from './SetupsPages'
import { SetupsExplorer } from './SetupsExplorer'
import { SetupTagButton } from './SetupTagMenu'
import { useSetupLibrary } from './useSetups'
import './SetupsView.css'
import './AnalysisBrowse.css'

/**
 * Setups: the setups Le Mans Ultimate stores, read from its setup folder (SetupsDomain.ts). Values
 * are changed in the game; Sprint only adds the driver's tags (session, style). Three pages over
 * the whole content width: the list (Analysis's two panes: cars by class on the left, the picked
 * car's tracks on the right), one setup opened from it with its versions, and two setups compared
 * (SetupsPages.tsx). The explorer (SetupsExplorer.tsx) switches between one car's setups. Which
 * page is open, the filters and the sort are the only local state; the
 * list is fetched again each time it is shown and after each tag.
 */
export function SetupsView({ send }: { send: (command: SprintCommand) => Promise<void> }) {
  const [page, setPage] = useState<SetupsPage>(LIST_PAGE)
  const [shown, setShown] = useState(0)
  const [tagError, setTagError] = useState<string | null>(null)
  const library = useSetupLibrary(shown)
  usePageUp(page.kind === 'list' ? null : 'All setups', () => toList())
  const setups = library.kind === 'ready' ? library.setups : []
  const explorerShown = useExplorerShown()
  const explorer = (
    <SetupsExplorer setups={setups} list={page.kind === 'list'} openId={page.kind === 'setup' ? page.setup.id : null} onList={toList} onOpen={(id) => setPage({ kind: 'setup', setup: { id, version: null } })} />
  )

  function toList() {
    setPage(LIST_PAGE)
    setShown((count) => count + 1)
  }

  const tag: TagSetup = (setupId, value) => {
    setTagError(null)
    send(buildTagSetup(setupId, value)).then(
      () => setShown((count) => count + 1),
      (error: unknown) => setTagError(error instanceof Error ? error.message : 'The tag could not be saved.'),
    )
  }
  const errorBar = tagError === null ? null : (
    <div className="infobar error" role="alert">
      <span className="infobar-icon">!</span>
      <strong className="infobar-title">Not tagged</strong>
      <span className="infobar-message">{tagError}</span>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setTagError(null)}>
        <X size={12} />
      </button>
    </div>
  )

  const openCompare = (from: string | null) => {
    const pair = comparePair(setups, from)
    if (pair) setPage({ kind: 'compare', ...pair })
  }

  if (page.kind === 'setup') {
    return (
      <>
        <SetupPage
          setup={page.setup}
          refresh={shown}
          notice={errorBar}
          onTag={tag}
          canCompare={setups.length > 1}
          onBack={explorerShown ? undefined : toList}
          onVersion={(version) => setPage({ kind: 'setup', setup: { id: page.setup.id, version } })}
          onCompare={(first: SetupRef, second: SetupRef | null) => {
            const pair = comparePair(setups, first.id)
            const other = second ?? pair?.second
            if (other) setPage({ kind: 'compare', first, second: other })
          }}
        />
        {explorer}
      </>
    )
  }

  if (page.kind === 'compare') {
    return (
      <>
        <ComparePage
          first={page.first}
          second={page.second}
          setups={setups}
          onBack={toList}
          onPick={(first, second) => setPage({ kind: 'compare', first, second })}
        />
        {explorer}
      </>
    )
  }

  return (
    <>
      <div className="setups-page">
        <PageHeader title="Setups">
          <button type="button" className="button" disabled={setups.length < 2} onClick={() => openCompare(null)}>
            <GitCompareArrows /> Compare…
          </button>
        </PageHeader>
        {errorBar}
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
          <SetupList setups={setups} onOpen={(id) => setPage({ kind: 'setup', setup: { id, version: null } })} onTag={tag} />
        )}
      </div>
      {explorer}
    </>
  )
}

const SORTS: ReadonlyArray<{ id: SetupSort; label: string }> = [
  { id: 'newest', label: 'Newest first' },
  { id: 'name', label: 'By name' },
]

const plural = (count: number, one: string, many: string) => `${count.toLocaleString()} ${count === 1 ? one : many}`

const REGIONS = new Intl.DisplayNames(['en'], { type: 'region' })

/**
 * The list: search, the filter chips (Track, Session, Style, Season) and sort over two panes. The
 * car pane lists every car the matching setups are for, by class on its colour rail; the other
 * pane the picked car's circuits, each closed until opened, its layouts apart.
 */
function SetupList({ setups, onOpen, onTag }: { setups: SetupItem[]; onOpen: (id: string) => void; onTag: TagSetup }) {
  const [filters, setFilters] = useState<SetupFilters>(NO_FILTERS)
  const [sort, setSort] = useState<SetupSort>('newest')
  const [pickedKey, setPickedKey] = useState<string | null>(null)
  // Circuits are closed until opened ("circuit:…" keys); classes open until closed ("closed:…"):
  // there are a handful, and the picked car sits in one.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: string) => {
    const next = new Set(open)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setOpen(next)
  }

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
  const cars = setupCars(matching)
  const picked = cars.find((car) => car.key === pickedKey) ?? cars[0] ?? null
  const filtered = hasFilters(filters)
  const countries = circuitCountries(setups)

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
        <span className="setups-count tabular">
          {filtered
            ? `${matching.length.toLocaleString()} of ${plural(setups.length, 'setup', 'setups')}`
            : `${plural(setups.length, 'setup', 'setups')} in Le Mans Ultimate`}
        </span>
        <SortButton sort={sort} onSort={setSort} />
      </div>

      <div className="setups-chips" role="group" aria-label="Filters">
        <ListFilter className="setups-chips-icon" aria-hidden="true" />
        {FILTERS.map((filter) => (
          <FilterChip
            key={filter.key}
            label={filter.label}
            choices={filterChoices(setups, filter.key, filters)}
            chosen={filters[filter.key]}
            onToggle={(value) => setFilters(toggleFilter(filters, filter.key, value))}
            onClear={() => setFilters({ ...filters, [filter.key]: [] })}
            icon={filter.key === 'track' ? (value) => <Flag country={countries.get(value) ?? null} /> : undefined}
          />
        ))}
        {filtered && (
          <button type="button" className="button subtle setups-clear" onClick={() => setFilters(NO_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {picked === null ? (
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
        <div className="browse">
          <nav className="card list-card browse-cars" aria-label="Cars">
            {classSections(cars, (car) => car.setups.length).map((section) => {
              const key = `closed:${section.tag}`
              const isOpen = !open.has(key)
              return (
                <div key={section.tag} className={`browse-class ${classTone(section.tag)}`}>
                  <button type="button" className="browse-pane-head" aria-expanded={isOpen} onClick={() => toggle(key)}>
                    {isOpen ? <ChevronDown /> : <ChevronRight />}
                    <ClassTag tag={section.tag} />
                    <span className="browse-pane-head-name">{section.name}</span>
                    <span className="browse-pane-head-count tabular">{plural(section.cars.length, 'car', 'cars')}</span>
                  </button>
                  {isOpen && (
                    <div className="list-rows browse-class-cars" role="listbox" aria-label={section.name}>
                      {section.cars.map((car) => (
                        <button
                          key={car.key}
                          type="button"
                          role="option"
                          aria-selected={car.key === picked.key}
                          className="list-row browse-car"
                          onClick={() => setPickedKey(car.key)}
                        >
                          <MakerLogo make={car.make} />
                          <span className="setups-row-name">
                            <strong>{car.car}</strong>
                            <span className="setups-dim">{plural(car.setups.length, 'setup', 'setups')}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
          <CarSetups car={picked} sort={sort} open={open} onToggle={toggle} onOpen={onOpen} onTag={onTag} />
        </div>
      )}
    </>
  )
}

function SortButton({ sort, onSort }: { sort: SetupSort; onSort: (sort: SetupSort) => void }) {
  const [menu, setMenu] = useState<MenuAnchor | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setMenu(null)
    button.current?.focus()
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="button subtle"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setMenu({ x: box.right - 180, y: box.bottom + 4 })
        }}
      >
        <ArrowUpDown /> {SORTS.find((option) => option.id === sort)?.label}
      </button>
      {menu && (
        <MenuLayer anchor={menu} label="Sort" width={180} onClose={close}>
          {SORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={sort === option.id}
              className="menu-item"
              onClick={() => {
                onSort(option.id)
                close()
              }}
            >
              <span className="setups-menu-check">{sort === option.id && <Check />}</span>
              {option.label}
            </button>
          ))}
        </MenuLayer>
      )}
    </>
  )
}

/** The picked car: its head (seasons, tracks, setups), then its circuits, each closed until opened. */
function CarSetups({
  car,
  sort,
  open,
  onToggle,
  onOpen,
  onTag,
}: {
  car: SetupCar
  sort: SetupSort
  open: ReadonlySet<string>
  onToggle: (key: string) => void
  onOpen: (id: string) => void
  onTag: TagSetup
}) {
  const circuits = setupCircuits(car.setups, sort)
  const seasons = [...new Set(car.setups.map((setup) => setup.season).filter((season): season is string => season !== null))]
  return (
    <div className="browse-detail">
      <div className="browse-detail-head">
        <MakerLogo make={car.make} />
        <h2 className="browse-detail-title">{car.car}</h2>
        <ClassTag tag={car.classTag} />
        <span className="setups-dim">
          {[...seasons.slice(0, 2), plural(circuits.length, 'track', 'tracks'), plural(car.setups.length, 'setup', 'setups')].join(' · ')}
        </span>
      </div>
      <section className="card list-card setups-groups" aria-label={`${car.car} setups`}>
        {circuits.map((circuit) => (
          <Circuit key={circuit.id} circuit={circuit} openKey={`circuit:${car.key}:${circuit.id}`} open={open} onToggle={onToggle} onOpen={onOpen} onTag={onTag} />
        ))}
      </section>
    </div>
  )
}

/** One circuit: closed until opened, then its setups, under a heading per layout when it has several. */
function Circuit({
  circuit,
  openKey,
  open,
  onToggle,
  onOpen,
  onTag,
}: {
  circuit: SetupCircuit
  openKey: string
  open: ReadonlySet<string>
  onToggle: (key: string) => void
  onOpen: (id: string) => void
  onTag: TagSetup
}) {
  const isOpen = open.has(openKey)
  const headed = circuit.layouts.length > 1
  const line = [
    circuit.country ? REGIONS.of(circuit.country) : null,
    headed ? `${circuit.layouts.length} layouts` : null,
    plural(circuit.count, 'setup', 'setups'),
  ].filter(Boolean)
  return (
    <div className="setups-group">
      <button type="button" className="setups-group-head" aria-expanded={isOpen} onClick={() => onToggle(openKey)}>
        {isOpen ? <ChevronDown /> : <ChevronRight />}
        <Flag country={circuit.country} />
        <span className="setups-group-text">
          <strong>{circuit.name}</strong>
          <span className="setups-dim">{line.join(' · ')}</span>
        </span>
      </button>
      {isOpen &&
        circuit.layouts.map((layout) => (
          <div key={layout.label}>
            {headed && (
              <div className="browse-layout-head">
                <strong>{layout.label}</strong>
                <span>{plural(layout.setups.length, 'setup', 'setups')}</span>
              </div>
            )}
            <div className="list-rows">
              {layout.setups.map((setup) => (
                <SetupRow key={setup.id} setup={setup} onOpen={onOpen} onTag={onTag} />
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}

/** One setup: its tag button, then the rest of the row opens it. Two buttons side by side, never one inside the other. */
function SetupRow({ setup, onOpen, onTag }: { setup: SetupItem; onOpen: (id: string) => void; onTag: TagSetup }) {
  return (
    <div className="list-row setups-row">
      <span className="setups-row-session">
        <SetupTagButton setup={setup} onTag={(value) => onTag(setup.id, value)} />
      </span>
      <button type="button" className="setups-row-open" onClick={() => onOpen(setup.id)}>
        <span className="setups-row-name">
          <strong>{setup.name}</strong>
          <span className="setups-dim">{savedLine(setup)}</span>
        </span>
        <SetupTags setup={setup} session={false} />
        <ChevronRight className="setups-row-chevron" />
      </button>
    </div>
  )
}
