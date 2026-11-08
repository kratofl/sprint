import { useRef, useState } from 'react'
import { ArrowLeftRight, Check, ChevronDown, ChevronLeft } from 'lucide-react'
import { LapTraceChartStack } from './AnalysisChart'
import { formatGap, formatLapSeconds } from './AnalysisDomain'
import type { CorpusLap } from './AnalysisDomain'
import { MenuLayer } from './DashesMenus'
import type { MenuAnchor } from './DashesMenus'
import type { CompareState } from './OnTrackDomain'
import {
  biggestGains,
  cornerWhere,
  drawableLaps,
  findCorners,
  formatSignedKph,
  formatSignedSeconds,
  lapKeyOf,
  lapOwner,
  lapOwnerInline,
  lapStanding,
  referenceFor,
  sameLap,
  speedPanel,
  timeGained,
  timeGainedPanel,
  yourBest,
} from './OnTrackLaps'
import type { Corner, LapKey } from './OnTrackLaps'
import { useLapTrace } from './useLapTrace'
import type { TraceState } from './useLapTrace'
// The chart stack's styles (.analysis-chart-*) live with Analysis, its first user.
import './AnalysisView.css'

/**
 * On track's lap page and compare page (OnTrackView.tsx holds the list and the page switch).
 * Both fetch the laps' lines on demand and draw them with Analysis's chart stack.
 */

/** "‹ All laps": the visible way up from a lap or compare page (Alt+Left / ⌘[ goes the same way). */
export function BackToLaps({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="button subtle ontrack-back" onClick={onBack}>
      <ChevronLeft /> All laps
    </button>
  )
}

/**
 * One lap opened from the list: how it stands against your best and the lap being chased, and
 * where along the lap it gains on your best. The view puts Chase this lap and Compare with… in
 * the toolbar.
 */
export function LapPage({ compare, lap, onBack }: { compare: CompareState; lap: CorpusLap; onBack: () => void }) {
  const standing = lapStanding(compare, lap)
  const best = yourBest(compare)
  const reference = referenceFor(compare, lap)
  const lapTrace = useLapTrace(lap)
  const referenceTrace = useLapTrace(reference)
  const referenceName = reference && best && sameLap(reference, best) ? 'your best' : reference ? `${lapOwnerInline(reference)}’s lap` : ''

  return (
    <>
      <BackToLaps onBack={onBack} />
      <section className="card ontrack-facts" aria-label="This lap">
        <div className="ontrack-fact">
          <span className="ontrack-fact-label">Lap time</span>
          <span className="ontrack-fact-value tabular">{formatLapSeconds(lap.lapTimeSeconds)}</span>
          <span className="ontrack-fact-sub">
            {lap.sharedFrom && <FriendBadge name={lap.sharedFrom} />}
            {lapWhen(lap)}
            {standing.isTarget && <span className="ontrack-tag">Chasing</span>}
          </span>
        </div>
        <div className="ontrack-fact">
          <span className="ontrack-fact-label">Against your best</span>
          {standing.isBest ? (
            <>
              <span className="ontrack-fact-value">Your best</span>
              <span className="ontrack-fact-sub">Your fastest lap here</span>
            </>
          ) : standing.versusBest !== null && best ? (
            <>
              <span className="ontrack-fact-value tabular">{formatGap(standing.versusBest)}</span>
              <span className="ontrack-fact-sub">{versus(standing.versusBest, best.lapTimeSeconds)}</span>
            </>
          ) : (
            <>
              <span className="ontrack-fact-value">None yet</span>
              <span className="ontrack-fact-sub">Drive a lap here to measure against</span>
            </>
          )}
        </div>
        <div className="ontrack-fact">
          <span className="ontrack-fact-label">Against what you chase</span>
          {standing.isTarget ? (
            <>
              <span className="ontrack-fact-value">This lap</span>
              <span className="ontrack-fact-sub">The HUD chases it</span>
            </>
          ) : standing.versusTarget !== null && compare.target ? (
            <>
              <span className="ontrack-fact-value tabular">{formatGap(standing.versusTarget)}</span>
              <span className="ontrack-fact-sub">{versus(standing.versusTarget, compare.target.lapTimeSeconds)}</span>
            </>
          ) : (
            <>
              <span className="ontrack-fact-value">Nothing picked</span>
              <span className="ontrack-fact-sub">Chase this lap to train against it</span>
            </>
          )}
        </div>
      </section>

      <section className="card ontrack-along" aria-label="Along the lap">
        <div className="card-header">
          <h2 className="card-title">Where this lap gains</h2>
          {reference && <span className="ontrack-card-note">Time ahead of {referenceName} at each point of the lap; the line rises where this lap gains.</span>}
        </div>
        {reference === null ? (
          <p className="list-card-empty">Nothing to measure this lap against yet: it is your only lap here.</p>
        ) : (
          <GainBody lap={lap} lapTrace={lapTrace} reference={reference} referenceTrace={referenceTrace} referenceName={referenceName} />
        )}
      </section>
    </>
  )
}

/** "Faster than 2:05.263" for a negative gap, "Slower than …" for a positive one. */
const versus = (gap: number, seconds: number): string =>
  `${gap < 0 ? 'Faster than' : gap > 0 ? 'Slower than' : 'Level with'} ${formatLapSeconds(seconds)}`

function GainBody({
  lap,
  lapTrace,
  reference,
  referenceTrace,
  referenceName,
}: {
  lap: CorpusLap
  lapTrace: TraceState
  reference: CorpusLap
  referenceTrace: TraceState
  referenceName: string
}) {
  if (lapTrace.kind === 'loading' || referenceTrace.kind === 'loading') return <div className="skeleton ontrack-chart-skeleton" />
  if (lapTrace.kind !== 'ready' || referenceTrace.kind !== 'ready') return <p className="list-card-empty">This lap’s line could not be read.</p>
  const gained = timeGained(lapTrace.trace, referenceTrace.trace)
  if (gained === null) return <p className="list-card-empty">Time along the lap was not recorded on one of these laps.</p>

  const gains = biggestGains(findCorners(lapTrace.trace, referenceTrace.trace))
  const where = (corner: Corner) => cornerWhere(corner.position, lap.context.trackLengthMeters ?? reference.context.trackLengthMeters)
  return (
    <>
      <div className="ontrack-chart">
        <LapTraceChartStack panels={[timeGainedPanel(`Time against ${referenceName}`, gained)]} />
      </div>
      {gains.length === 0 ? (
        <p className="ontrack-gains-none">No corner where this lap gains on {referenceName}.</p>
      ) : (
        <ul className="ontrack-gains" aria-label="Biggest gains">
          {gains.map((corner) => {
            const faster = corner.lapMinKph - corner.referenceMinKph
            return (
              <li key={corner.number}>
                <strong>
                  Corner {corner.number} · {where(corner)}
                </strong>
                <span className="tabular">
                  {(corner.gainedSeconds ?? 0).toFixed(3)} s{Math.round(faster) >= 1 ? ` · ${formatSignedKph(faster)} at the slowest point` : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/**
 * Two laps against each other: where the time goes, both laps' speed, and corner by corner. Either
 * lap can be swapped for any other of `laps`; the arrows swap the two.
 */
export function ComparePage({
  laps,
  first,
  second,
  onBack,
  onPick,
}: {
  /** The laps either side can be swapped for: each with a line, fastest first. */
  laps: CorpusLap[]
  first: CorpusLap
  second: CorpusLap
  onBack: () => void
  onPick: (first: LapKey, second: LapKey) => void
}) {
  const firstTrace = useLapTrace(first)
  const secondTrace = useLapTrace(second)
  const gap = Math.round((first.lapTimeSeconds - second.lapTimeSeconds) * 1000) / 1000
  const faster = gap < 0 ? first : second

  return (
    <>
      <BackToLaps onBack={onBack} />
      <div className="ontrack-picks">
        <LapPicker label="First lap" lap={first} other={second} laps={laps} onPick={(lap) => onPick(lapKeyOf(lap), lapKeyOf(second))} />
        <button type="button" className="icon-button" aria-label="Swap the laps" title="Swap the laps" onClick={() => onPick(lapKeyOf(second), lapKeyOf(first))}>
          <ArrowLeftRight />
        </button>
        <LapPicker label="Second lap" lap={second} other={first} laps={laps} onPick={(lap) => onPick(lapKeyOf(first), lapKeyOf(lap))} />
        <span className="ontrack-verdict">
          {gap === 0 ? (
            <span className="ontrack-verdict-value">Level</span>
          ) : (
            <>
              <span className="ontrack-fact-label">{lapOwner(faster)} is faster by</span>
              <span className="ontrack-verdict-value tabular">{Math.abs(gap).toFixed(3)} s</span>
            </>
          )}
        </span>
      </div>
      <CompareBody first={first} second={second} firstTrace={firstTrace} secondTrace={secondTrace} />
    </>
  )
}

function CompareBody({ first, second, firstTrace, secondTrace }: { first: CorpusLap; second: CorpusLap; firstTrace: TraceState; secondTrace: TraceState }) {
  if (firstTrace.kind === 'loading' || secondTrace.kind === 'loading') {
    return (
      <div className="ontrack-two">
        <div className="card skeleton ontrack-chart-card-skeleton" />
        <div className="card skeleton ontrack-chart-card-skeleton" />
      </div>
    )
  }
  if (firstTrace.kind !== 'ready' || secondTrace.kind !== 'ready') {
    return (
      <div className="card">
        <p className="list-card-empty">One of these laps’ lines could not be read.</p>
      </div>
    )
  }

  const gained = timeGained(firstTrace.trace, secondTrace.trace)
  const corners = findCorners(firstTrace.trace, secondTrace.trace)
  const firstName = lapOwner(first)
  const secondName = lapOwner(second)
  const length = first.context.trackLengthMeters ?? second.context.trackLengthMeters
  return (
    <>
      <div className="ontrack-two">
        <section className="card ontrack-chart-card" aria-label="Time gained">
          {gained === null ? (
            <p className="list-card-empty">Time along the lap was not recorded on one of these laps.</p>
          ) : (
            <LapTraceChartStack panels={[timeGainedPanel(`Time ${firstName} gains`, gained)]} />
          )}
        </section>
        <section className="card ontrack-chart-card" aria-label="Speed">
          <LapTraceChartStack panels={[speedPanel(firstTrace.trace, firstName, secondTrace.trace, secondName)]} />
        </section>
      </div>
      <section className="card list-card ontrack-corners" aria-label="Corner by corner">
        <div className="card-header">
          <h2 className="card-title">Corner by corner</h2>
        </div>
        {corners.length === 0 ? (
          <p className="list-card-empty">No corners found: speed was not recorded on one of these laps.</p>
        ) : (
          <div role="table" aria-label="Corner by corner">
            <div role="row" className="ontrack-corner-row ontrack-table-head">
              <span role="columnheader">Corner</span>
              <span role="columnheader">Where</span>
              <span role="columnheader" className="ontrack-num">
                {firstName} · slowest
              </span>
              <span role="columnheader" className="ontrack-num">
                {secondName} · slowest
              </span>
              <span role="columnheader" className="ontrack-num">
                Difference
              </span>
              <span role="columnheader" className="ontrack-num">
                Time {firstName} gains
              </span>
            </div>
            {corners.map((corner) => (
              <div role="row" key={corner.number} className="ontrack-corner-row">
                <span role="cell">Corner {corner.number}</span>
                <span role="cell" className="ontrack-dim">
                  {cornerWhere(corner.position, length)}
                </span>
                <span role="cell" className="ontrack-num tabular">
                  {Math.round(corner.lapMinKph)} km/h
                </span>
                <span role="cell" className="ontrack-num tabular ontrack-dim">
                  {Math.round(corner.referenceMinKph)} km/h
                </span>
                <span role="cell" className="ontrack-num tabular">
                  {formatSignedKph(corner.lapMinKph - corner.referenceMinKph)}
                </span>
                <span role="cell" className="ontrack-num tabular">
                  {corner.gainedSeconds === null ? '–' : formatSignedSeconds(corner.gainedSeconds)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

const PICKER_MENU_WIDTH = 320

/** One side of compare: the lap, and a menu of every lap with a line to swap it for. */
function LapPicker({ label, lap, other, laps, onPick }: { label: string; lap: CorpusLap; other: CorpusLap; laps: CorpusLap[]; onPick: (lap: CorpusLap) => void }) {
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setMenuAt(null)
    button.current?.focus()
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="ontrack-picker"
        aria-label={`${label}: ${lapOwner(lap)}, ${formatLapSeconds(lap.lapTimeSeconds)}`}
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setMenuAt({ x: box.left, y: box.bottom + 4 })
        }}
      >
        <span className="ontrack-picker-text">
          <strong>
            {lapOwner(lap)} · <span className="tabular">{formatLapSeconds(lap.lapTimeSeconds)}</span>
          </strong>
          <span className="ontrack-picker-sub">{lapDay(lap)}</span>
        </span>
        <ChevronDown />
      </button>
      {menuAt && (
        <MenuLayer anchor={menuAt} label={label} width={PICKER_MENU_WIDTH} onClose={close}>
          {laps.map((option) => {
            const current = sameLap(option, lap)
            return (
              <button
                key={`${option.sessionId}/${option.lapNumber}`}
                type="button"
                role="menuitemradio"
                aria-checked={current}
                disabled={sameLap(option, other)}
                className="menu-item ontrack-course-item"
                onClick={() => {
                  close()
                  if (!current) onPick(option)
                }}
              >
                <span className="ontrack-course-check">{current && <Check />}</span>
                <span className="ontrack-course-name">
                  <span>
                    <span className="tabular">{formatLapSeconds(option.lapTimeSeconds)}</span> · {lapOwner(option)}
                  </span>
                  <span className="ontrack-course-car">{lapDay(option)}</span>
                </span>
              </button>
            )
          })}
        </MenuLayer>
      )}
    </>
  )
}

/** A friend's initial in a small round badge, so their laps read apart from yours at a glance. */
export function FriendBadge({ name }: { name: string }) {
  return (
    <span className="ontrack-friend" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** "Lap 5 · Mon, Sep 28", or for a friend's lap "Ada Brandt · Fri, Oct 2". */
export function lapWhen(lap: CorpusLap): string {
  if (lap.sharedFrom) return `${lap.sharedFrom}${lap.sessionStartedAt ? ` · ${shortDay(lap.sessionStartedAt)}` : ''}`
  if (!lap.sessionStartedAt) return `Lap ${lap.lapNumber}`
  return `Lap ${lap.lapNumber} · ${shortDay(lap.sessionStartedAt)}`
}

/** Under a lap already named by its owner: "Friend’s lap · Fri, Oct 2", or "Mon, Sep 28". */
const lapDay = (lap: CorpusLap): string => {
  const day = lap.sessionStartedAt ? shortDay(lap.sessionStartedAt) : null
  if (lap.sharedFrom) return day ? `Friend’s lap · ${day}` : 'Friend’s lap'
  return day ?? `Lap ${lap.lapNumber}`
}

export const shortDay = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
