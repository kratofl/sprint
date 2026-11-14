import { useRef, useState } from 'react'
import { ArrowLeftRight, Check, ChevronDown, ChevronLeft, GitCompareArrows, History } from 'lucide-react'
import { Popover } from '../shell/Menu'
import { PageHeader } from '../shell/PageHeader'
import { formatLapSeconds, fuelText } from './AnalysisDomain'
import { TABS, carAtTrack, compareBlocks, dateTime, differenceCounts, drivenRows, lapsLine, searchSetups, sheetBlocks, shortDate, tyresLine } from './SetupsDomain'
import type { SetupDriven, SetupItem, SetupRef, SetupSheet, SetupTab } from './SetupsDomain'
import { moveInSearchList } from './searchListKeys'
import { useSetupDriven, useSetupSheet } from './useSetups'
import type { SheetState } from './useSetups'

/** Back up to the list; the toolbar keeps the page's name, as on every detail page. */
function BackToSetups({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="button subtle setups-back" onClick={onBack}>
      <ChevronLeft /> All setups
    </button>
  )
}

/** What a setup's name says: its session (unless the row shows it apart), style and version, as small tags. */
export function SetupTags({ setup, session = true }: { setup: SetupItem; session?: boolean }) {
  return (
    <span className="setups-tags">
      {session && setup.session && <span className="chip">{setup.session}</span>}
      {setup.style && <span className={setup.style === 'Wet' ? 'chip chip-info' : 'chip'}>{setup.style}</span>}
      {setup.version && <span className="chip chip-muted">v{setup.version}</span>}
    </span>
  )
}

/** The five tabs; `counts` adds each tab's number of differences (compare). */
function SetupTabs({ tab, onTab, counts }: { tab: SetupTab; onTab: (tab: SetupTab) => void; counts?: Record<SetupTab, number> }) {
  return (
    <div className="tabs setups-tabs" role="tablist" aria-label="Setup sections">
      {TABS.map((option) => (
        <button key={option.id} type="button" role="tab" className="tab" aria-selected={tab === option.id} onClick={() => onTab(option.id)}>
          {option.label}
          {counts && counts[option.id] > 0 && (
            <span className="setups-tab-count tabular" aria-label={`${counts[option.id]} differences`}>
              {counts[option.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/**
 * One setup opened from the list: its values on five tabs as the game wrote them, and the
 * versions Sprint kept of it. Older versions open in place, with a way back to the one the game
 * holds now.
 */
export function SetupPage({
  setup,
  canCompare,
  onBack,
  onVersion,
  onCompare,
}: {
  setup: SetupRef
  canCompare: boolean
  onBack: () => void
  onVersion: (version: string | null) => void
  onCompare: (first: SetupRef, second: SetupRef | null) => void
}) {
  const [tab, setTab] = useState<SetupTab>('Suspension')
  const state = useSetupSheet(setup)
  const driven = useSetupDriven(setup.id)

  return (
    <div className="setups-page">
      <PageHeader title="Setups">
        <button type="button" className="button" disabled={!canCompare || state.kind !== 'ready'} onClick={() => onCompare(setup, null)}>
          <GitCompareArrows /> Compare with…
        </button>
      </PageHeader>
      <BackToSetups onBack={onBack} />
      {state.kind === 'loading' ? (
        <>
          <div className="card skeleton setups-head-skeleton" />
          <div className="card skeleton setups-list-skeleton" />
        </>
      ) : state.kind === 'missing' ? (
        <div className="card setups-empty">
          <div className="empty-state">
            <h2>This setup is gone</h2>
            <p>The game no longer has it, or the version was not kept.</p>
          </div>
        </div>
      ) : (
        <SetupSheetView
          sheet={state.sheet}
          driven={driven}
          tab={tab}
          onTab={setTab}
          onVersion={onVersion}
          onCompareNow={() => onCompare({ id: setup.id, version: state.sheet.versionId }, { id: setup.id, version: null })}
        />
      )}
    </div>
  )
}

function SetupSheetView({
  sheet,
  driven,
  tab,
  onTab,
  onVersion,
  onCompareNow,
}: {
  sheet: SetupSheet
  /** How each version drove, once read. */
  driven: SetupDriven[] | null
  tab: SetupTab
  onTab: (tab: SetupTab) => void
  onVersion: (version: string | null) => void
  onCompareNow: () => void
}) {
  const shown = sheet.versions.find((version) => version.id === sheet.versionId)
  const old = shown !== undefined && !shown.isCurrent
  const blocks = sheetBlocks(sheet.readings, tab)
  const { setup } = sheet
  const lapsOn = (versionId: string) => driven?.find((entry) => entry.versionId === versionId) ?? null
  const shownDriven = lapsOn(sheet.versionId)

  return (
    <>
      <header className="setups-head">
        <div className="setups-head-main">
          <h2 className="setups-head-title">{setup.name}</h2>
          <span className="setups-dim">
            {carAtTrack(setup)}
            {setup.carClass ? ` · ${setup.carClass}` : ''}
            {setup.season ? ` · ${setup.season}` : ''}
          </span>
        </div>
        <SetupTags setup={setup} />
        <span className="setups-dim setups-head-saved">Saved in the game {dateTime(setup.savedAt)}</span>
      </header>

      {old && (
        <div className="infobar info" role="status">
          <span className="infobar-icon">
            <History />
          </span>
          <span className="infobar-message">
            You're looking at the version from {dateTime(shown.savedAt)}. The game holds a newer one.
          </span>
          <button type="button" className="button" onClick={onCompareNow}>
            Compare with now
          </button>
          <button type="button" className="button" onClick={() => onVersion(null)}>
            Show now
          </button>
        </div>
      )}

      <SetupTabs tab={tab} onTab={onTab} />
      <div className="setups-detail">
        <div className="setups-blocks" role="tabpanel">
          {blocks.length === 0 ? (
            <p className="setups-none">Nothing on this tab can be set on this car.</p>
          ) : (
            blocks.map((block) => (
              <section key={block.title} className="card setups-block" aria-label={block.title}>
                <h3 className="card-title">{block.title}</h3>
                <dl className="setups-values">
                  {block.rows.map((row) => (
                    <div key={row.label} className="setups-value">
                      <dt>{row.label}</dt>
                      <dd className="tabular" title={row.sides ? `Left ${row.sides[0]} · right ${row.sides[1]}` : undefined}>
                        {row.display}
                        {row.sides && <span className="setups-sides">left · right</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))
          )}
        </div>

        <div className="setups-side">
          <section className="card setups-block setups-driven" aria-label="On track">
            <h3 className="card-title">On track</h3>
            {shownDriven === null ? (
              <p className="setups-dim">{driven === null ? 'Reading the laps…' : 'No laps on this version.'}</p>
            ) : shownDriven.laps === 0 ? (
              <p className="setups-dim">No laps on this version yet. Put it on a run in Analysis to see how it drives.</p>
            ) : (
              <dl className="setups-values">
                <div className="setups-value">
                  <dt>Best lap</dt>
                  <dd className="tabular">{formatLapSeconds(shownDriven.bestLapSeconds)}</dd>
                </div>
                <div className="setups-value">
                  <dt>Median lap</dt>
                  <dd className="tabular">{formatLapSeconds(shownDriven.medianLapSeconds)}</dd>
                </div>
                <div className="setups-value">
                  <dt>Laps</dt>
                  <dd>{lapsLine(shownDriven)}</dd>
                </div>
                <div className="setups-value">
                  <dt>Tyres</dt>
                  <dd>{tyresLine(shownDriven)}</dd>
                </div>
                <div className="setups-value">
                  <dt>Fuel per lap</dt>
                  <dd className="tabular">{fuelText(shownDriven.fuelPerLapLiters)}</dd>
                </div>
              </dl>
            )}
          </section>
          <section className="card list-card setups-versions" aria-label="Versions">
            <div className="card-header">
              <h3 className="card-title">Versions</h3>
            </div>
            <div className="list-rows">
              {sheet.versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  className={`list-row setups-version${version.id === sheet.versionId ? ' selected' : ''}`}
                  aria-current={version.id === sheet.versionId}
                  onClick={() => onVersion(version.isCurrent ? null : version.id)}
                >
                  <strong>{version.isCurrent ? 'In the game now' : `Saved ${shortDate(version.savedAt)}`}</strong>
                  <span className="setups-dim">
                    {version.isCurrent ? `Saved ${dateTime(version.savedAt)}` : dateTime(version.savedAt)}
                    {(lapsOn(version.id)?.laps ?? 0) > 0 && ` · ${lapsOn(version.id)?.laps === 1 ? '1 lap' : `${lapsOn(version.id)?.laps} laps`}`}
                  </span>
                </button>
              ))}
            </div>
            <p className="setups-versions-note">Sprint keeps a version each time the game saves this setup with changes.</p>
          </section>
        </div>
      </div>
    </>
  )
}

/**
 * Two setups against each other, tab by tab. Each tab says how many values differ; "Only
 * differences" hides the rest. Read-only: a setup is changed in the game.
 */
export function ComparePage({
  first,
  second,
  setups,
  onBack,
  onPick,
}: {
  first: SetupRef
  second: SetupRef
  setups: SetupItem[]
  onBack: () => void
  onPick: (first: SetupRef, second: SetupRef) => void
}) {
  const [tab, setTab] = useState<SetupTab>('Suspension')
  const [onlyDifferences, setOnlyDifferences] = useState(true)
  const a = useSetupSheet(first)
  const b = useSetupSheet(second)
  const drivenA = useSetupDriven(first.id)
  const drivenB = useSetupDriven(second.id)

  return (
    <div className="setups-page">
      <PageHeader title="Setups" />
      <BackToSetups onBack={onBack} />
      <div className="setups-picks">
        <SetupPicker label="First setup" current={first} state={a} other={second} setups={setups} onPick={(ref) => onPick(ref, second)} />
        <button type="button" className="icon-button" aria-label="Swap the two setups" title="Swap" onClick={() => onPick(second, first)}>
          <ArrowLeftRight />
        </button>
        <SetupPicker label="Second setup" current={second} state={b} other={first} setups={setups} onPick={(ref) => onPick(first, ref)} />
        <div className="segmented setups-only" role="radiogroup" aria-label="Rows">
          <button type="button" role="radio" className="segmented-item" aria-checked={!onlyDifferences} onClick={() => setOnlyDifferences(false)}>
            All values
          </button>
          <button type="button" role="radio" className="segmented-item" aria-checked={onlyDifferences} onClick={() => setOnlyDifferences(true)}>
            Only differences
          </button>
        </div>
      </div>

      {a.kind === 'loading' || b.kind === 'loading' ? (
        <div className="card skeleton setups-list-skeleton" />
      ) : a.kind !== 'ready' || b.kind !== 'ready' ? (
        <div className="card setups-empty">
          <div className="empty-state">
            <h2>One of these setups is gone</h2>
            <p>Pick another one above.</p>
          </div>
        </div>
      ) : (
        <>
          <DrivenCard
            first={a.sheet}
            second={b.sheet}
            drivenFirst={drivenA?.find((entry) => entry.versionId === a.sheet.versionId) ?? null}
            drivenSecond={drivenB?.find((entry) => entry.versionId === b.sheet.versionId) ?? null}
          />
          <CompareBody first={a.sheet} second={b.sheet} tab={tab} onTab={setTab} onlyDifferences={onlyDifferences} />
        </>
      )}
    </div>
  )
}

function CompareBody({
  first,
  second,
  tab,
  onTab,
  onlyDifferences,
}: {
  first: SetupSheet
  second: SetupSheet
  tab: SetupTab
  onTab: (tab: SetupTab) => void
  onlyDifferences: boolean
}) {
  const counts = differenceCounts(first.readings, second.readings)
  const blocks = compareBlocks(first.readings, second.readings, tab, onlyDifferences)
  const total = TABS.reduce((sum, option) => sum + counts[option.id], 0)

  return (
    <>
      <SetupTabs tab={tab} onTab={onTab} counts={counts} />
      <section className="card list-card setups-compare" aria-label="Values" role="tabpanel">
        {total === 0 ? (
          <p className="list-card-empty">These two setups are the same.</p>
        ) : blocks.length === 0 ? (
          <p className="list-card-empty">{onlyDifferences ? 'Nothing differs on this tab.' : 'Nothing on this tab can be set on these cars.'}</p>
        ) : (
          <div role="table" aria-label="Values">
            <div role="row" className="setups-compare-row setups-table-head">
              <span role="columnheader">Setting</span>
              <span role="columnheader" className="setups-num">
                {sheetName(first)}
              </span>
              <span role="columnheader" className="setups-num">
                {sheetName(second)}
              </span>
              <span role="columnheader" className="setups-num">
                Difference
              </span>
            </div>
            {blocks.map((block) => (
              <div key={block.title} role="rowgroup">
                <div role="row" className="setups-compare-group">
                  <span role="rowheader">{block.title}</span>
                </div>
                {block.rows.map((row) => (
                  <div key={row.label} role="row" className={`setups-compare-row${row.differs ? ' differs' : ''}`}>
                    <span role="cell">{row.label}</span>
                    <span role="cell" className="setups-num tabular">
                      {row.first ?? '—'}
                    </span>
                    <span role="cell" className="setups-num tabular">
                      {row.second ?? '—'}
                    </span>
                    <span role="cell" className="setups-num setups-dim tabular">
                      {row.differs ? (row.difference ?? 'Differs') : ''}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

/**
 * How the two setups drove, over the runs the driver put them on in Analysis. Shown only once
 * either has laps: until then there is nothing to compare, and the values below still are.
 */
function DrivenCard({
  first,
  second,
  drivenFirst,
  drivenSecond,
}: {
  first: SetupSheet
  second: SetupSheet
  drivenFirst: SetupDriven | null
  drivenSecond: SetupDriven | null
}) {
  if (drivenFirst === null || drivenSecond === null || (drivenFirst.laps === 0 && drivenSecond.laps === 0)) return null

  return (
    <section className="card list-card setups-compare" aria-label="On track">
      <div className="card-header">
        <h2 className="card-title">On track</h2>
        <span className="setups-dim">Laps on runs you put these setups on</span>
      </div>
      <div role="table" aria-label="On track">
        <div role="row" className="setups-compare-row setups-table-head">
          <span role="columnheader" />
          <span role="columnheader" className="setups-num">
            {sheetName(first)}
          </span>
          <span role="columnheader" className="setups-num">
            {sheetName(second)}
          </span>
          <span role="columnheader" className="setups-num">
            Difference
          </span>
        </div>
        {drivenRows(drivenFirst, drivenSecond).map((row) => (
          <div key={row.label} role="row" className="setups-compare-row differs">
            <span role="cell">{row.label}</span>
            <span role="cell" className="setups-num tabular">
              {row.first}
            </span>
            <span role="cell" className="setups-num tabular">
              {row.second}
            </span>
            <span role="cell" className="setups-num setups-dim tabular">
              {row.difference}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** A column head: the setup's name, and which version when it is not the one in the game now. */
const sheetName = (sheet: SetupSheet): string => {
  const version = sheet.versions.find((candidate) => candidate.id === sheet.versionId)
  return version && !version.isCurrent ? `${sheet.setup.name} (${shortDate(version.savedAt)})` : sheet.setup.name
}

/**
 * Picks one side of compare: a search over every setup, the same car first. A setup's older
 * version is opened from that setup's own page (Compare with now), not here.
 */
function SetupPicker({
  label,
  current,
  state,
  other,
  setups,
  onPick,
}: {
  label: string
  current: SetupRef
  state: SheetState
  other: SetupRef
  setups: SetupItem[]
  onPick: (ref: SetupRef) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const button = useRef<HTMLButtonElement | null>(null)
  const [anchor, setAnchor] = useState({ x: 0, y: 0 })
  const sheet = state.kind === 'ready' ? state.sheet : null
  const close = () => {
    setOpen(false)
    setQuery('')
    button.current?.focus()
  }

  const options = searchSetups(setups, query, sheet?.setup.car ?? null)

  return (
    <>
      <button
        ref={button}
        type="button"
        className="setups-picker"
        aria-label={`${label}: ${sheet ? sheetName(sheet) : 'loading'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setAnchor({ x: box.left, y: box.bottom + 4 })
          setOpen(true)
        }}
      >
        <span className="setups-picker-text">
          <strong>{sheet ? sheetName(sheet) : '…'}</strong>
          <span className="setups-dim">{sheet ? carAtTrack(sheet.setup) : ''}</span>
        </span>
        <ChevronDown />
      </button>
      {open && (
        <Popover
          label={label}
          className="setups-picker-menu"
          style={{ left: Math.max(8, Math.min(anchor.x, window.innerWidth - 368)), top: anchor.y }}
          onClose={close}
          onKeyDown={(event) => {
            if (moveInSearchList(event.currentTarget, event.key)) event.preventDefault()
          }}
        >
          <input
            type="search"
            placeholder="Search setup, car or track"
            aria-label="Search setups"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="setups-picker-list" role="listbox" aria-label={label}>
            {options.length === 0 && <p className="setups-none">No setups match.</p>}
            {options.map((setup) => {
              const picked = setup.id === current.id && current.version === null
              return (
                <button
                  key={setup.id}
                  type="button"
                  role="option"
                  aria-selected={picked}
                  disabled={setup.id === other.id && other.version === null}
                  className="menu-item setups-picker-item"
                  onClick={() => {
                    close()
                    if (!picked) onPick({ id: setup.id, version: null })
                  }}
                >
                  <span className="setups-menu-check">{picked && <Check />}</span>
                  <span className="setups-picker-text">
                    <span>{setup.name}</span>
                    <span className="setups-dim">{carAtTrack(setup)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </Popover>
      )}
    </>
  )
}
