import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Crosshair, FileDown, MoreHorizontal, Warehouse } from 'lucide-react'
import { carLine, dayLabel, formatGap, formatLapSeconds, fuelText, lapTimeStats, lapsByRun, runLine, runTitle, tyreText } from './AnalysisDomain'
import type { CorpusLap, CorpusRun, CorpusSession } from './AnalysisDomain'
import { lapTimesPlot, tickLabel } from './AnalysisPlot'
import type { PlotDot } from './AnalysisPlot'
import { RunSetupButton } from './AnalysisRunSetup'
import { MenuLayer, type MenuAnchor } from '../shell/Menu'

/**
 * Analysis's second page: one session. Its head, every lap time on a chart with the runs side by
 * side, then the laps under their runs, each run with the setup the driver put on it. A lap with
 * a line opens the lap page; what else a lap can do sits behind its ⋯ menu.
 */

/** "‹ All sessions", the session's kind and time, then its car (name and model), track and day. */
export function SessionHead({ session, onBack }: { session: CorpusSession; onBack: () => void }) {
  const context = [carLine(session.context), session.context.trackCourse, dayLabel(session.day ?? session.startedAt)]
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
      <span className="analysis-secondary">{context}</span>
    </div>
  )
}

/**
 * Every lap time of the session as a dot, runs side by side, lower is faster; the dashed line is
 * your best with this car here. Hover or focus a dot for the lap; a dot with a line opens that lap.
 */
export function LapTimesCard({
  laps,
  runs,
  yourBest,
  onOpen,
}: {
  laps: readonly CorpusLap[]
  runs: readonly CorpusRun[]
  /** Your fastest lap with this car here, from any session; null with none of your own. */
  yourBest: CorpusLap | null
  onOpen: (lap: CorpusLap) => void
}) {
  const [hover, setHover] = useState<PlotDot | null>(null)
  const plot = lapTimesPlot(laps, runs, yourBest?.lapTimeSeconds ?? null)
  const stats = lapTimeStats(laps)
  if (plot === null || stats.best === null) return null

  const bestHere = yourBest !== null && yourBest.sessionId === stats.best.sessionId && yourBest.lapNumber === stats.best.lapNumber
  const summary = [
    `Best ${formatLapSeconds(stats.best.lapTimeSeconds)}`,
    stats.medianSeconds === null ? null : `median ${formatLapSeconds(stats.medianSeconds)}`,
    bestHere ? 'your best here' : yourBest ? `${formatGap(stats.best.lapTimeSeconds - yourBest.lapTimeSeconds)} to your best here` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

  return (
    <section className="card analysis-times" aria-label="Lap times">
      <div className="card-header">
        <h2 className="card-title">Lap times</h2>
        <span className="analysis-secondary tabular">{summary}</span>
      </div>
      <div className="analysis-times-plot">
        <svg className="analysis-times-svg" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
          {plot.runs.map((run) => (
            <rect key={run.title} className="analysis-times-band" x={run.from * 1000} y={0} width={(run.to - run.from) * 1000} height={100} />
          ))}
          {plot.ticks.map((tick) => (
            <line key={tick.seconds} className="analysis-times-grid" x1={0} x2={1000} y1={tick.y * 100} y2={tick.y * 100} />
          ))}
          {plot.reference && <line className="analysis-times-reference" x1={0} x2={1000} y1={plot.reference.y * 100} y2={plot.reference.y * 100} />}
          {plot.runs.map((run) => (
            <polyline key={run.title} className="analysis-times-line" points={run.dots.map((dot) => `${dot.x * 1000},${dot.y * 100}`).join(' ')} />
          ))}
        </svg>
        {plot.ticks.map((tick) => (
          <span key={tick.seconds} className="analysis-times-tick tabular" style={{ top: `${tick.y * 100}%` }}>
            {tickLabel(tick.seconds)}
          </span>
        ))}
        {plot.reference && (
          <span className="analysis-times-reference-label tabular" style={{ top: `${plot.reference.y * 100}%` }}>
            Your best here {formatLapSeconds(plot.reference.seconds)}
          </span>
        )}
        {plot.runs.flatMap((run) =>
          run.dots.map((dot) => {
            const best = dot.lap.lapNumber === stats.best?.lapNumber
            return (
              <button
                key={dot.lap.lapNumber}
                type="button"
                className={`analysis-times-dot${best ? ' best' : ''}${dot.lap.hasChannels ? '' : ' time-only'}${dot.clipped ? ' clipped' : ''}`}
                style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }}
                aria-label={`${dot.lap.label}, ${formatLapSeconds(dot.lap.lapTimeSeconds)}${dot.lap.hasChannels ? '. Open it' : ', time only'}`}
                aria-disabled={!dot.lap.hasChannels}
                onPointerEnter={() => setHover(dot)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(dot)}
                onBlur={() => setHover(null)}
                onClick={() => dot.lap.hasChannels && onOpen(dot.lap)}
              />
            )
          }),
        )}
        {hover && <DotTip dot={hover} best={stats.best} />}
      </div>
      <div className="analysis-times-runs">
        {plot.runs.map((run) => (
          <span key={run.title} className="analysis-times-run" style={{ left: `${run.from * 100}%`, width: `${(run.to - run.from) * 100}%` }}>
            <strong>{run.title}</strong>
            {run.detail && <span className="analysis-secondary"> · {run.detail}</span>}
          </span>
        ))}
      </div>
    </section>
  )
}

function DotTip({ dot, best }: { dot: PlotDot; best: CorpusLap }) {
  const lap = dot.lap
  const facts = [
    lap.lapNumber === best.lapNumber ? 'Best' : formatGap(lap.lapTimeSeconds - best.lapTimeSeconds),
    tyreText(lap.frontCompound, lap.rearCompound),
    lap.fuelUsedLiters === null ? null : fuelText(lap.fuelUsedLiters),
  ].filter((part): part is string => part !== null)
  return (
    <div className={`analysis-times-tip${dot.x > 0.7 ? ' left' : ''}`} style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%` }} role="status">
      <strong className="tabular">
        {lap.label} · {formatLapSeconds(lap.lapTimeSeconds)}
      </strong>
      <span className="tabular">{facts.join(' · ')}</span>
      <span>{lap.hasChannels ? 'Click to open' : 'Time only: no line to show'}</span>
    </div>
  )
}

export type LapOrder = 'LapNumber' | 'Fastest'

/**
 * The session's laps under the runs they were driven in (out of the garage and back), each run
 * with the setup the driver put on it. A session that does not know its runs is one list.
 */
export function LapList({
  laps,
  runs,
  car,
  order,
  onOrder,
  onSetRunSetup,
  onOpen,
  onExport,
  onTrain,
}: {
  laps: readonly CorpusLap[]
  runs: readonly CorpusRun[]
  car: string
  order: LapOrder
  onOrder: (order: LapOrder) => void
  onSetRunSetup: (outing: number, setupId: string | null) => void
  /** Opens a lap with a line on its own page. */
  onOpen: (lap: CorpusLap) => void
  /** Saves the lap as a .sprintlap. Offered only on laps with a line: a time alone has nothing to share. */
  onExport: (lap: CorpusLap) => void
  /** Makes the lap the On track page's training target. Laps with a line only: the HUD draws them. */
  onTrain: (lap: CorpusLap) => void
}) {
  const rows = [...laps].sort((a, b) => (order === 'LapNumber' ? a.lapNumber - b.lapNumber : a.lapTimeSeconds - b.lapTimeSeconds))
  const best = lapTimeStats(laps).best
  const groups = lapsByRun(rows, runs)
  const ordered = [...runs].sort((a, b) => a.number - b.number)
  const row = (lap: CorpusLap) => <LapRow key={lap.lapNumber} lap={lap} best={best} onOpen={onOpen} onExport={onExport} onTrain={onTrain} />

  return (
    <section className="card list-card" aria-label="Laps">
      <div className="card-header">
        <h2 className="card-title">Laps</h2>
        <span className="analysis-secondary">A new run starts each time you drive out of the garage</span>
        <span className="analysis-spacer" />
        <div className="segmented" role="radiogroup" aria-label="Order">
          {(['LapNumber', 'Fastest'] as const).map((option) => (
            <button key={option} type="button" role="radio" className="segmented-item" aria-checked={order === option} onClick={() => onOrder(option)}>
              {option === 'LapNumber' ? 'Lap order' : 'Fastest first'}
            </button>
          ))}
        </div>
      </div>
      <div className="list-header analysis-lap-columns">
        <span>Lap</span>
        <span className="analysis-num">Time</span>
        <span className="analysis-num">Gap</span>
        <span>Tyres</span>
        <span className="analysis-num">Fuel used</span>
        <span>Line</span>
        <span />
      </div>
      {groups.length === 0 ? (
        <div className="list-rows" role="list">
          {rows.map(row)}
        </div>
      ) : (
        groups.map(({ run, laps: runLaps }) => {
          const before = ordered[ordered.indexOf(run) - 1]?.setup ?? null
          return (
            <div key={run.outing} className="analysis-run" role="group" aria-label={runTitle(run)}>
              <div className="analysis-run-head">
                <span className="analysis-run-icon" aria-hidden="true">
                  <Warehouse size={16} />
                </span>
                <span className="analysis-run-text">
                  <strong>{runTitle(run)}</strong>
                  <span className="analysis-secondary">{runLine(run)}</span>
                </span>
                {run.outing !== 0 && <RunSetupButton run={run} before={before} car={car} onPick={(setupId) => onSetRunSetup(run.outing, setupId)} />}
              </div>
              <div className="list-rows" role="list">
                {runLaps.map(row)}
              </div>
            </div>
          )
        })
      )}
    </section>
  )
}

/** One lap. With a line the whole row opens it (its lap name is the real button) and ⋯ holds the rest. */
function LapRow({
  lap,
  best,
  onOpen,
  onExport,
  onTrain,
}: {
  lap: CorpusLap
  best: CorpusLap | null
  onOpen: (lap: CorpusLap) => void
  onExport: (lap: CorpusLap) => void
  onTrain: (lap: CorpusLap) => void
}) {
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null)
  const more = useRef<HTMLButtonElement | null>(null)
  const isBest = best?.lapNumber === lap.lapNumber
  const tyres = tyreText(lap.frontCompound, lap.rearCompound)
  const close = () => {
    setMenuAt(null)
    more.current?.focus()
  }
  const act = (action: (lap: CorpusLap) => void) => {
    close()
    action(lap)
  }

  return (
    <div className={`list-row analysis-lap-columns${lap.hasChannels ? ' opens' : ''}${isBest ? ' best' : ''}`} role="listitem">
      {lap.hasChannels ? (
        <button type="button" className="analysis-lap-open" aria-label={`Open ${lap.label}`} onClick={() => onOpen(lap)}>
          {lap.label}
        </button>
      ) : (
        <span className="analysis-strong">{lap.label}</span>
      )}
      <span className="analysis-num tabular analysis-strong analysis-lap-time">{formatLapSeconds(lap.lapTimeSeconds)}</span>
      <span className="analysis-num tabular analysis-secondary">{isBest ? 'Best' : best ? formatGap(lap.lapTimeSeconds - best.lapTimeSeconds) : '—'}</span>
      <span className="analysis-ellipsis" title={tyres ?? undefined}>
        {tyres ?? <span className="analysis-secondary">—</span>}
      </span>
      <span className="analysis-num tabular analysis-secondary">{fuelText(lap.fuelUsedLiters)}</span>
      <span className="analysis-secondary" title={lap.unavailableReason ?? undefined}>
        {lap.hasChannels ? 'Recorded' : 'Time only'}
      </span>
      <span className="analysis-lap-end">
        {lap.hasChannels && (
          <>
            <button
              ref={more}
              type="button"
              className="icon-button analysis-lap-more"
              aria-label={`More for ${lap.label}`}
              aria-haspopup="menu"
              aria-expanded={menuAt !== null}
              onClick={(event) => {
                const box = event.currentTarget.getBoundingClientRect()
                setMenuAt({ x: box.right - 220, y: box.bottom + 4 })
              }}
            >
              <MoreHorizontal size={16} />
            </button>
            <ChevronRight className="analysis-lap-chevron" aria-hidden="true" />
          </>
        )}
      </span>
      {menuAt && (
        <MenuLayer anchor={menuAt} label={`${lap.label}`} width={220} onClose={close}>
          <button type="button" role="menuitem" className="menu-item" onClick={() => act(onTrain)}>
            <Crosshair size={14} /> Train against this lap
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => act(onExport)}>
            <FileDown size={14} /> Save lap file…
          </button>
        </MenuLayer>
      )}
    </div>
  )
}
