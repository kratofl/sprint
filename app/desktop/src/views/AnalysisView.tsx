import { useEffect, useState } from 'react'
import { BarChart3, ChevronLeft, Download, RefreshCw, X } from 'lucide-react'
import { bridge } from '../bridge'
import type { SprintCommand } from '../bridge'
import type { RuntimeState } from '../shell/runtime'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import { Status } from '../shell/Status'
import {
  ALL_LAP_CHART_PANELS,
  ANALYSIS_DEFAULT_PANELS,
  EMPTY_ANALYSIS_STATE,
  applyLapListFilter,
  buildAnalysisFilter,
  buildAnalysisRefresh,
  buildAnalysisSelectLap,
  buildAnalysisSelectSession,
  buildLapTraceChartPanels,
  dayLabel,
  formatGap,
  formatLapSeconds,
  isTraceUsable,
  lapTimeStats,
  parseAnalysisState,
  parseLapChannelTrace,
} from './AnalysisDomain'
import type {
  AnalysisFilterPatch,
  AnalysisFilterState,
  AnalysisLapFilter,
  AnalysisLapSort,
  AnalysisState,
  CorpusLap,
  CorpusSession,
  LapChannelTrace,
  LapTraceSeriesSource,
} from './AnalysisDomain'
import { LapTraceChartStack } from './AnalysisChart'
import './AnalysisView.css'

/**
 * Analysis: browse the recorded/imported/shared lap corpus, pick a primary and a comparison
 * lap — even across two different sessions — and overlay their traces (docs/specs/live-compare.md
 * §2.6 "hosts the chart stack, two-lap overlay, target picker"; the target-picker half is not
 * built here). All narrowing and lap-picking state lives server-side in `AnalysisController`;
 * this view only renders `state.analysis` and sends `analysis.*` commands.
 *
 * Layout: the CommandBar holds the view options as selects (corpus filters on the session list,
 * lap filter + sort inside a session) and Refresh. The page has no primary action — browsing
 * has no single next step. Inside a session: a KPI row of lap stats, the lap comparison chart
 * card, then the laps; on the session list the chart card sits above the sessions whenever a lap
 * is picked, because a comparison can span two sessions.
 *
 * "Import results" (the LMU results archive, #185) opens the shell's import dialog when the game
 * has an archive; imported sessions join the corpus this page browses.
 */
export function AnalysisView({
  runtime,
  send,
  onImportResults,
}: {
  runtime: RuntimeState
  send: (command: SprintCommand) => Promise<void>
  /** Opens the shell's import dialog; absent when the game has no results archive. */
  onImportResults?: () => void
}) {
  const analysis: AnalysisState = runtime.kind === 'ready' ? parseAnalysisState(runtime.sprint) : EMPTY_ANALYSIS_STATE

  const [lapFilter, setLapFilter] = useState<AnalysisLapFilter>('All')
  const [lapSort, setLapSort] = useState<AnalysisLapSort>('Fastest')
  const [panelIds, setPanelIds] = useState<string[]>(ANALYSIS_DEFAULT_PANELS.map((panel) => panel.id))
  const [actionError, setActionError] = useState<string | null>(null)
  const primaryTrace = useLapTrace(analysis.primary)
  const comparisonTrace = useLapTrace(analysis.comparison)

  if (runtime.kind === 'loading') {
    return (
      <div className="analysis-page">
        <PageHeader title="Analysis" />
        <div className="analysis-kpis">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="kpi skeleton analysis-kpi-skeleton" />
          ))}
        </div>
        <div className="card skeleton analysis-card-skeleton" />
      </div>
    )
  }

  const runAction = async (command: SprintCommand) => {
    setActionError(null)
    try {
      await send(command)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'That change could not be applied.')
    }
  }

  const { filter, session, primary, comparison } = analysis
  const corpusEmpty = filter.games.length === 0 && filter.sessions.length === 0 && filter.tracks.length === 0
  const onFilter = (patch: AnalysisFilterPatch) => void runAction(buildAnalysisFilter(patch))
  const filterSelects = session || corpusEmpty ? [] : corpusFilterSelects(filter)

  return (
    <div className="analysis-page">
      <PageHeader title="Analysis">
        {session ? (
          <>
            <select aria-label="Show laps" value={lapFilter} onChange={(event) => setLapFilter(lapFilterFrom(event.target.value))}>
              <option value="All">All laps</option>
              <option value="WithChannels">With channels</option>
              <option value="TimeOnly">Time only</option>
            </select>
            <select aria-label="Sort laps" value={lapSort} onChange={(event) => setLapSort(event.target.value === 'LapNumber' ? 'LapNumber' : 'Fastest')}>
              <option value="Fastest">Fastest first</option>
              <option value="LapNumber">Lap order</option>
            </select>
            <CommandDivider />
          </>
        ) : (
          filterSelects.length > 0 && (
            <>
              {filterSelects.map((select) => (
                <select
                  key={select.key}
                  aria-label={select.label}
                  value={select.value ?? ''}
                  onChange={(event) => {
                    const patch: AnalysisFilterPatch = {}
                    patch[select.key] = event.target.value === '' ? null : event.target.value
                    onFilter(patch)
                  }}
                >
                  <option value="">{select.allLabel}</option>
                  {select.options.map((option) => (
                    <option key={option} value={option}>
                      {select.key === 'day' ? dayLabel(option) : option}
                    </option>
                  ))}
                </select>
              ))}
              <CommandDivider />
            </>
          )
        )}
        <button type="button" className="button subtle" onClick={() => void runAction(buildAnalysisRefresh())}>
          <RefreshCw /> Refresh
        </button>
        {onImportResults && (
          <button type="button" className="button subtle" onClick={onImportResults}>
            <Download /> Import results
          </button>
        )}
      </PageHeader>

      {actionError && (
        <div className="infobar error" role="alert">
          <span className="infobar-icon">!</span>
          <strong className="infobar-title">Not applied</strong>
          <span className="infobar-message">{actionError}</span>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setActionError(null)}>
            <X size={12} />
          </button>
        </div>
      )}

      {analysis.notice && (
        <div className="infobar info" role="status">
          <span className="infobar-icon">i</span>
          <span className="infobar-message">{analysis.notice}</span>
        </div>
      )}

      {session ? (
        <>
          <SessionHead session={session} onBack={() => void runAction(buildAnalysisSelectSession(null))} />
          <LapKpis laps={analysis.laps} primary={primary} comparison={comparison} />
          <ComparisonCard
            primary={primary}
            comparison={comparison}
            primaryTrace={primaryTrace}
            comparisonTrace={comparisonTrace}
            panelIds={panelIds}
            onTogglePanel={(id) => setPanelIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
            onClear={(role) => void runAction(buildAnalysisSelectLap(role, null))}
          />
          <LapList
            laps={analysis.laps}
            primary={primary}
            comparison={comparison}
            lapFilter={lapFilter}
            lapSort={lapSort}
            onSelect={(role, lapNumber) => void runAction(buildAnalysisSelectLap(role, lapNumber))}
          />
        </>
      ) : corpusEmpty ? (
        <div className="card">
          <div className="empty-state">
            <BarChart3 size={28} strokeWidth={1.5} />
            <h2>No laps recorded yet</h2>
            <p>Drive a session, or import one, and it will appear here.</p>
          </div>
        </div>
      ) : (
        <>
          {(primary || comparison) && (
            <ComparisonCard
              primary={primary}
              comparison={comparison}
              primaryTrace={primaryTrace}
              comparisonTrace={comparisonTrace}
              panelIds={panelIds}
              onTogglePanel={(id) => setPanelIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
              onClear={(role) => void runAction(buildAnalysisSelectLap(role, null))}
            />
          )}
          <SessionList
            sessions={filter.sessions}
            onOpen={(id) => void runAction(buildAnalysisSelectSession(id))}
            onClearFilters={() => onFilter({ track: null, carClass: null, carModel: null, day: null })}
            filtered={filter.track !== null || filter.carClass !== null || filter.carModel !== null || filter.day !== null}
          />
        </>
      )}
    </div>
  )
}

// ── Trace loading ──────────────────────────────────────────────────────────

/** A selected lap's trace: none picked or no channels, fetching, drawn, or fetched but unusable. */
type TraceState = { kind: 'none' } | { kind: 'loading' } | { kind: 'ready'; trace: LapChannelTrace } | { kind: 'unavailable' }

/**
 * Lap traces are fetched on demand (bridge.analysisTrace), never held in polled state — a
 * trace is a few hundred KB, too large to poll every frame.
 */
function useLapTrace(lap: CorpusLap | null): TraceState {
  const [state, setState] = useState<TraceState>({ kind: 'none' })
  const sessionId = lap?.sessionId
  const lapNumber = lap?.lapNumber
  const hasChannels = lap?.hasChannels === true

  useEffect(() => {
    if (sessionId === undefined || lapNumber === undefined || !hasChannels) {
      setState({ kind: 'none' })
      return
    }

    let cancelled = false
    setState({ kind: 'loading' })
    void bridge.analysisTrace(sessionId, lapNumber).then((raw) => {
      if (cancelled) return
      const trace = parseLapChannelTrace(raw)
      setState(trace && isTraceUsable(trace) ? { kind: 'ready', trace } : { kind: 'unavailable' })
    })

    return () => {
      cancelled = true
    }
  }, [sessionId, lapNumber, hasChannels])

  return state
}

// ── CommandBar filter selects ──────────────────────────────────────────────

type FilterSelect = { key: 'track' | 'carClass' | 'carModel' | 'day'; label: string; allLabel: string; value: string | null; options: string[] }

/** The corpus filters worth offering: tracks whenever there are any, the others only when they actually narrow (2+). */
function corpusFilterSelects(filter: AnalysisFilterState): FilterSelect[] {
  const selects: FilterSelect[] = []
  if (filter.tracks.length > 0) selects.push({ key: 'track', label: 'Track', allLabel: 'All tracks', value: filter.track, options: filter.tracks })
  if (filter.classes.length > 1) selects.push({ key: 'carClass', label: 'Class', allLabel: 'All classes', value: filter.carClass, options: filter.classes })
  if (filter.carModels.length > 1) selects.push({ key: 'carModel', label: 'Car', allLabel: 'All cars', value: filter.carModel, options: filter.carModels })
  if (filter.days.length > 1) selects.push({ key: 'day', label: 'Day', allLabel: 'All days', value: filter.day, options: filter.days })
  return selects
}

const lapFilterFrom = (value: string): AnalysisLapFilter => (value === 'WithChannels' || value === 'TimeOnly' ? value : 'All')

// ── Session list ───────────────────────────────────────────────────────────

function SessionList({
  sessions,
  filtered,
  onOpen,
  onClearFilters,
}: {
  sessions: readonly CorpusSession[]
  filtered: boolean
  onOpen: (sessionId: string) => void
  onClearFilters: () => void
}) {
  return (
    <section className="card list-card" aria-label="Sessions">
      <div className="card-header">
        <h2 className="card-title">Sessions</h2>
        <span className="muted tabular">{sessions.length}</span>
      </div>
      <div className="list-header analysis-session-columns">
        <span>Day</span>
        <span>Session</span>
        <span>Track</span>
        <span>Car</span>
        <span className="analysis-num">Laps</span>
        <span className="analysis-num">Best</span>
      </div>
      {sessions.length === 0 ? (
        <div className="list-card-empty analysis-list-empty">
          <span className="muted">No sessions match this filter.</span>
          {filtered && (
            <button type="button" className="button small" onClick={onClearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="list-rows">
          {sessions.map((session) => (
            <button key={session.id} type="button" className="list-row analysis-session-columns" onClick={() => onOpen(session.id)}>
              <span className="analysis-secondary">{session.day ? dayLabel(session.day) : '—'}</span>
              <span className="analysis-cell-strong">
                <span className="analysis-ellipsis">{session.label}</span>
                {session.origin !== 'Recorded' && <span className="chip chip-muted">{session.origin}</span>}
              </span>
              <span className="analysis-ellipsis" title={session.context.trackCourse}>
                {session.context.trackCourse || '—'}
              </span>
              <span className="analysis-ellipsis analysis-secondary" title={session.context.carModel}>
                {session.context.carModel || '—'}
              </span>
              <span className="analysis-num tabular">{session.lapCount}</span>
              <span className="analysis-num tabular analysis-strong">{formatLapSeconds(session.bestLapSeconds)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Inside a session ───────────────────────────────────────────────────────

function SessionHead({ session, onBack }: { session: CorpusSession; onBack: () => void }) {
  const context = [session.day ? dayLabel(session.day) : null, session.context.trackCourse, session.context.carModel, session.detail]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ')

  return (
    <div className="analysis-session-head">
      <button type="button" className="button subtle analysis-back" onClick={onBack}>
        <ChevronLeft /> All sessions
      </button>
      <div className="analysis-session-heading">
        <h2 className="analysis-session-name">{session.label}</h2>
        {session.origin !== 'Recorded' && <span className="chip chip-muted">{session.origin}</span>}
      </div>
      {context && <span className="muted">{context}</span>}
    </div>
  )
}

function LapKpis({ laps, primary, comparison }: { laps: readonly CorpusLap[]; primary: CorpusLap | null; comparison: CorpusLap | null }) {
  const stats = lapTimeStats(laps)
  const gap = primary && comparison ? primary.lapTimeSeconds - comparison.lapTimeSeconds : null

  return (
    <div className="analysis-kpis">
      <div className="kpi">
        <span className="kpi-label">Laps</span>
        <span className="kpi-value">{stats.count}</span>
        <span className="kpi-delta">{stats.traced === 0 ? 'Lap times only' : `${stats.traced} with channels`}</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Best lap</span>
        <span className="kpi-value">{formatLapSeconds(stats.best?.lapTimeSeconds ?? null)}</span>
        <span className="kpi-delta">{stats.best ? stats.best.label : 'No timed laps'}</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Median lap</span>
        <span className="kpi-value">{formatLapSeconds(stats.medianSeconds)}</span>
        <span className="kpi-delta">
          {stats.medianSeconds !== null && stats.best ? `${formatGap(stats.medianSeconds - stats.best.lapTimeSeconds)} to best` : 'No timed laps'}
        </span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Primary vs comparison</span>
        <span className="kpi-value">{gap !== null ? formatGap(gap) : '—'}</span>
        <span className="kpi-delta analysis-kpi-detail">
          {primary && comparison ? `${primary.label} vs ${comparison.label}` : 'Pick two laps to compare'}
        </span>
      </div>
    </div>
  )
}

function LapList({
  laps,
  primary,
  comparison,
  lapFilter,
  lapSort,
  onSelect,
}: {
  laps: readonly CorpusLap[]
  primary: CorpusLap | null
  comparison: CorpusLap | null
  lapFilter: AnalysisLapFilter
  lapSort: AnalysisLapSort
  onSelect: (role: 'primary' | 'comparison', lapNumber: number | null) => void
}) {
  const rows = applyLapListFilter(laps, lapFilter, lapSort)
  const best = lapTimeStats(laps).best

  return (
    <section className="card list-card" aria-label="Laps">
      <div className="card-header">
        <h2 className="card-title">Laps</h2>
        <span className="muted tabular">{rows.length === laps.length ? laps.length : `${rows.length} of ${laps.length}`}</span>
      </div>
      <div className="list-header analysis-lap-columns">
        <span>Lap</span>
        <span className="analysis-num">Time</span>
        <span className="analysis-num">Gap</span>
        <span>Trace</span>
        <span />
      </div>
      {rows.length === 0 ? (
        <div className="list-card-empty analysis-list-empty">
          <span className="muted">No laps match this filter.</span>
        </div>
      ) : (
        <div className="list-rows" role="list">
          {rows.map((lap) => {
            const isPrimary = primary?.sessionId === lap.sessionId && primary.lapNumber === lap.lapNumber
            const isComparison = comparison?.sessionId === lap.sessionId && comparison.lapNumber === lap.lapNumber
            const rowClass = isPrimary ? 'list-row analysis-lap-columns selected' : isComparison ? 'list-row analysis-lap-columns is-comparison' : 'list-row analysis-lap-columns'
            const isBest = best?.lapNumber === lap.lapNumber

            return (
              <div key={lap.lapNumber} className={rowClass} role="listitem">
                <span className="analysis-strong">{lap.label}</span>
                <span className="analysis-num tabular analysis-strong">{formatLapSeconds(lap.lapTimeSeconds)}</span>
                <span className="analysis-num tabular analysis-secondary">{isBest ? 'Best' : best ? formatGap(lap.lapTimeSeconds - best.lapTimeSeconds) : '—'}</span>
                <Status
                  tone={lap.hasChannels ? 'success' : 'neutral'}
                  className={lap.hasChannels ? undefined : 'analysis-trace-missing'}
                  title={lap.unavailableReason ?? undefined}
                >
                  {lap.hasChannels ? 'Channels' : 'Time only'}
                </Status>
                <span className="analysis-lap-actions">
                  <button
                    type="button"
                    className="button small analysis-pick role-primary"
                    aria-pressed={isPrimary}
                    onClick={() => onSelect('primary', isPrimary ? null : lap.lapNumber)}
                  >
                    Primary
                  </button>
                  <button
                    type="button"
                    className="button small analysis-pick role-comparison"
                    aria-pressed={isComparison}
                    onClick={() => onSelect('comparison', isComparison ? null : lap.lapNumber)}
                  >
                    Compare
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Lap comparison chart card ──────────────────────────────────────────────

function ComparisonCard({
  primary,
  comparison,
  primaryTrace,
  comparisonTrace,
  panelIds,
  onTogglePanel,
  onClear,
}: {
  primary: CorpusLap | null
  comparison: CorpusLap | null
  primaryTrace: TraceState
  comparisonTrace: TraceState
  panelIds: readonly string[]
  onTogglePanel: (panelId: string) => void
  onClear: (role: 'primary' | 'comparison') => void
}) {
  const sources: LapTraceSeriesSource[] = []
  if (primary && primaryTrace.kind === 'ready') sources.push({ trace: primaryTrace.trace, label: primary.label, role: 'Current' })
  if (comparison && comparisonTrace.kind === 'ready') sources.push({ trace: comparisonTrace.trace, label: comparison.label, role: 'Comparison' })
  const panels = ALL_LAP_CHART_PANELS.filter((panel) => panelIds.includes(panel.id))
  const chartPanels = sources.length > 0 ? buildLapTraceChartPanels(sources, panels) : []
  const loading = primaryTrace.kind === 'loading' || comparisonTrace.kind === 'loading'

  const emptyText = loading
    ? 'Loading the lap trace…'
    : !primary && !comparison
      ? 'Pick a primary lap, and a comparison lap to overlay it, from the laps below.'
      : 'No channel trace was recorded for the selected laps. Their times are in the lap list.'

  return (
    <section className="card analysis-chart-card" aria-label="Lap comparison">
      <div className="analysis-card-head">
        <h2 className="card-title">Lap comparison</h2>
        <div className="analysis-legend">
          {primary && <LegendLap lap={primary} role="primary" onClear={() => onClear('primary')} />}
          {comparison && <LegendLap lap={comparison} role="comparison" onClear={() => onClear('comparison')} />}
        </div>
      </div>

      {sources.length > 0 ? (
        <>
          <div className="analysis-panel-chips" role="group" aria-label="Charts">
            {ALL_LAP_CHART_PANELS.map((panel) => {
              const shown = panelIds.includes(panel.id)
              return (
                <button key={panel.id} type="button" className={shown ? 'chip chip-default' : 'chip chip-muted'} aria-pressed={shown} onClick={() => onTogglePanel(panel.id)}>
                  {panel.title}
                </button>
              )
            })}
          </div>
          {chartPanels.length > 0 ? <LapTraceChartStack panels={chartPanels} /> : <p className="muted analysis-chart-empty">Pick at least one chart above.</p>}
        </>
      ) : (
        <p className="muted analysis-chart-empty">{emptyText}</p>
      )}
    </section>
  )
}

/** A legend entry for a picked lap: 8px series square (brand = primary, blue = comparison), the lap, and a clear button. */
function LegendLap({ lap, role, onClear }: { lap: CorpusLap; role: 'primary' | 'comparison'; onClear: () => void }) {
  return (
    <span className={`analysis-legend-item role-${role}`}>
      <span className="analysis-legend-key" aria-hidden="true" />
      <span className="analysis-legend-label" title={lap.detail}>
        {role === 'primary' ? 'Primary' : 'Comparison'}: {lap.label} · {formatLapSeconds(lap.lapTimeSeconds)}
      </span>
      <button type="button" className="icon-button analysis-legend-clear" aria-label={`Clear ${role} lap`} onClick={onClear}>
        <X size={12} />
      </button>
    </span>
  )
}
