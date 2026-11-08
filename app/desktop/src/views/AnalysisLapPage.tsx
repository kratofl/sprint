import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, Crosshair, GitCompareArrows, MoreHorizontal, Plus, X } from 'lucide-react'
import { carLine, formatGap, formatLapSeconds, fuelText, tyreText } from './AnalysisDomain'
import type { CorpusLap, CorpusRun, CorpusSession, LapChannelTrace } from './AnalysisDomain'
import { LapTraceChartStack, LineKey } from './AnalysisChart'
import type { ChartMark } from './AnalysisChart'
import { buildLapCharts, lapCorners, verdict } from './AnalysisLapCharts'
import type { LapPanelOf } from './AnalysisLapCharts'
import { LAP_CHART_TITLES, addChart, hiddenCharts, moveChart, removeChart } from './AnalysisLapLayout'
import type { LapChartId, LapLayout } from './AnalysisLapLayout'
import { MenuLayer } from './DashesMenus'
import type { MenuAnchor } from './DashesMenus'
import { FriendBadge, shortDay } from './OnTrackPages'
import { sameLap } from './OnTrackLaps'
import { useLapTrace } from './useLapTrace'

/**
 * Analysis's third page: one lap, on its own. Where it went on the track (the map) beside its
 * channels, each chart arranged by the driver (its ⋯ menu, "Add chart"). Comparing is a choice:
 * "Compare with…" picks another lap with this car on this track — yours first, then shared ones —
 * and it joins every chart grey and dashed until "Stop comparing".
 */
export function LapPage({
  lap,
  session,
  runs,
  sessionLaps,
  courseLaps,
  yourBest,
  compareWith,
  layout,
  onLayout,
  onCompare,
  onBack,
  onTrain,
}: {
  lap: CorpusLap
  session: CorpusSession
  runs: readonly CorpusRun[]
  sessionLaps: readonly CorpusLap[]
  /** Every lap with this car on this track that has a line, fastest first: what Compare with… offers. */
  courseLaps: readonly CorpusLap[]
  yourBest: CorpusLap | null
  compareWith: CorpusLap | null
  layout: LapLayout
  onLayout: (layout: LapLayout) => void
  onCompare: (lap: CorpusLap | null) => void
  onBack: () => void
  onTrain: (lap: CorpusLap) => void
}) {
  const lapTrace = useLapTrace(lap)
  const otherTrace = useLapTrace(compareWith)
  const [cursor, setCursor] = useState<number | null>(null)
  const others = courseLaps.filter((candidate) => !sameLap(candidate, lap))

  return (
    <>
      <LapHead
        lap={lap}
        session={session}
        runs={runs}
        sessionLaps={sessionLaps}
        yourBest={yourBest}
        compareWith={compareWith}
        others={others}
        onCompare={onCompare}
        onBack={onBack}
        onTrain={onTrain}
      />
      {lapTrace.kind === 'loading' || lapTrace.kind === 'none' ? (
        <div className="card skeleton analysis-card-skeleton" />
      ) : lapTrace.kind === 'unavailable' ? (
        <div className="card">
          <p className="muted analysis-chart-empty">This lap’s line could not be read.</p>
        </div>
      ) : (
        <LapBody
          lapLabel={lapName(lap, session)}
          otherLabel={compareWith ? lapName(compareWith, session) : null}
          trace={lapTrace.trace}
          compareWith={compareWith}
          otherTrace={otherTrace.kind === 'ready' ? otherTrace.trace : null}
          layout={layout}
          onLayout={onLayout}
          cursor={cursor}
          onCursor={setCursor}
        />
      )}
    </>
  )
}

/** What to call a lap beside another: a shared lap by its driver, one of this session by number, others by their session. */
export function lapName(lap: CorpusLap, session: CorpusSession): string {
  if (lap.sharedFrom) return lap.sharedFrom
  if (lap.sessionId === session.id) return `Lap ${lap.lapNumber}`
  const kind = lap.detail.split(' · ')[0] ?? ''
  return `${kind === 'Qualify' ? 'Quali' : kind} lap ${lap.lapNumber}`.trim()
}

function LapHead({
  lap,
  session,
  runs,
  sessionLaps,
  yourBest,
  compareWith,
  others,
  onCompare,
  onBack,
  onTrain,
}: {
  lap: CorpusLap
  session: CorpusSession
  runs: readonly CorpusRun[]
  sessionLaps: readonly CorpusLap[]
  yourBest: CorpusLap | null
  compareWith: CorpusLap | null
  others: readonly CorpusLap[]
  onCompare: (lap: CorpusLap | null) => void
  onBack: () => void
  onTrain: (lap: CorpusLap) => void
}) {
  const run = runs.find((candidate) => candidate.outing === lap.outing && lap.outing !== 0)
  const fastest = sessionLaps.reduce<CorpusLap | null>((best, candidate) => (best === null || candidate.lapTimeSeconds < best.lapTimeSeconds ? candidate : best), null)
  const isYourBest = yourBest !== null && sameLap(yourBest, lap)
  const line = [
    run ? `Run ${run.number}` : null,
    tyreText(lap.frontCompound, lap.rearCompound),
    lap.fuelUsedLiters !== null ? fuelText(lap.fuelUsedLiters) : null,
    fastest !== null && sameLap(fastest, lap) && sessionLaps.length > 1 ? 'fastest of the session' : null,
    isYourBest ? 'your best here' : yourBest && !lap.sharedFrom ? `${formatGap(lap.lapTimeSeconds - yourBest.lapTimeSeconds)} to your best here` : null,
  ]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' · ')
  const name = lapName(lap, session)
  const result = compareWith ? verdict(name, lap.lapTimeSeconds, lapName(compareWith, session), compareWith.lapTimeSeconds) : null

  return (
    <div className="analysis-lap-head">
      <button type="button" className="button subtle analysis-back" onClick={onBack}>
        <ChevronLeft /> {session.label}
      </button>
      <div className="analysis-lap-headrow">
        <div className="analysis-lap-title">
          <h2 className="analysis-session-name">
            {lap.sharedFrom ? `${lap.sharedFrom}’s lap` : `Lap ${lap.lapNumber}`} · <span className="tabular">{formatLapSeconds(lap.lapTimeSeconds)}</span>
          </h2>
          {line && <span className="analysis-secondary">{line}</span>}
        </div>
        <div className="analysis-lap-actions">
          {compareWith ? (
            <>
              <ComparePicker lap={lap} session={session} others={others} chosen={compareWith} onPick={onCompare} />
              <button type="button" className="button subtle" onClick={() => onCompare(null)}>
                <X /> Stop comparing
              </button>
              {result && (
                <span className="analysis-verdict">
                  <span className="analysis-secondary">{result.faster} is faster by</span>
                  <strong className="tabular">{result.gap.toFixed(3)} s</strong>
                </span>
              )}
            </>
          ) : (
            <>
              {lap.hasChannels && (
                <button type="button" className="button subtle" onClick={() => onTrain(lap)}>
                  <Crosshair /> Train against it
                </button>
              )}
              <ComparePicker lap={lap} session={session} others={others} chosen={null} onPick={onCompare} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const PICKER_WIDTH = 440

/**
 * "Compare with…", or once comparing the lap compared with: a menu of the other laps with this
 * car on this track — yours, then shared ones — each with its session and its gap to this lap.
 */
function ComparePicker({
  lap,
  session,
  others,
  chosen,
  onPick,
}: {
  lap: CorpusLap
  session: CorpusSession
  others: readonly CorpusLap[]
  chosen: CorpusLap | null
  onPick: (lap: CorpusLap) => void
}) {
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setMenuAt(null)
    button.current?.focus()
  }
  const mine = others.filter((other) => !other.sharedFrom)
  const shared = others.filter((other) => other.sharedFrom)
  const row = (other: CorpusLap) => {
    const day = other.sessionStartedAt ? shortDay(other.sessionStartedAt) : null
    const isChosen = chosen !== null && sameLap(chosen, other)
    return (
      <button
        key={`${other.sessionId}-${other.lapNumber}`}
        type="button"
        role="menuitemradio"
        aria-checked={isChosen}
        className={`menu-item analysis-pick-row${isChosen ? ' selected' : ''}`}
        onClick={() => {
          close()
          onPick(other)
        }}
      >
        {other.sharedFrom && <FriendBadge name={other.sharedFrom} />}
        <span className="analysis-pick-text">
          <span className="analysis-strong">{lapName(other, session)}</span>
          <span className="analysis-secondary">{[other.sharedFrom ? 'Shared' : other.detail, day].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="analysis-secondary tabular">{formatGap(other.lapTimeSeconds - lap.lapTimeSeconds)}</span>
        <span className="analysis-strong tabular">{formatLapSeconds(other.lapTimeSeconds)}</span>
      </button>
    )
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={chosen ? 'button analysis-compared' : 'button'}
        disabled={others.length === 0}
        title={others.length === 0 ? 'No other lap with a recorded line on this car and track yet' : undefined}
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setMenuAt({ x: Math.max(8, box.right - PICKER_WIDTH), y: box.bottom + 4 })
        }}
      >
        {chosen ? (
          <>
            <span className="analysis-secondary">Compared with</span> {lapName(chosen, session)} <ChevronDown />
          </>
        ) : (
          <>
            <GitCompareArrows /> Compare with…
          </>
        )}
      </button>
      {menuAt && (
        <MenuLayer anchor={menuAt} label="Compare with" width={PICKER_WIDTH} onClose={close}>
          <div className="analysis-pick-scope">{[carLine(session.context), session.context.trackCourse].filter(Boolean).join(' · ')}</div>
          {mine.length > 0 && <div className="analysis-pick-head">Your laps</div>}
          {mine.map(row)}
          {shared.length > 0 && <div className="analysis-pick-head">Shared laps</div>}
          {shared.map(row)}
        </MenuLayer>
      )}
    </>
  )
}

/** The map beside the charts, or the charts alone when the map is off (or the lap has no positions). */
function LapBody({
  lapLabel,
  otherLabel,
  trace,
  compareWith,
  otherTrace,
  layout,
  onLayout,
  cursor,
  onCursor,
}: {
  lapLabel: string
  otherLabel: string | null
  trace: LapChannelTrace
  compareWith: CorpusLap | null
  otherTrace: LapChannelTrace | null
  layout: LapLayout
  onLayout: (layout: LapLayout) => void
  cursor: number | null
  onCursor: (position: number | null) => void
}) {
  const marks = lapCorners(trace)
  const hasMap = 'worldX' in trace.channels && 'worldZ' in trace.channels
  const showMap = layout.map && hasMap
  return (
    <div className={showMap ? 'analysis-lap-body with-map' : 'analysis-lap-body'}>
      {showMap && <TrackMapCard trace={trace} marks={marks} cursor={cursor} onRemove={() => onLayout({ ...layout, map: false })} />}
      <TelemetryCard
        lapLabel={lapLabel}
        otherLabel={otherLabel}
        trace={trace}
        compareWith={compareWith}
        otherTrace={otherTrace}
        marks={marks}
        layout={layout}
        onLayout={onLayout}
        canAddMap={!layout.map && hasMap}
        onCursor={onCursor}
      />
    </div>
  )
}

const MAP_WIDTH = 360
// Room round the line for the corner labels, which sit outside it.
const MAP_PAD = 28

/**
 * The lap drawn on the track from the car's recorded position, seen from above: green where the
 * throttle was flat, red under braking, grey in between. The dot follows the charts' cursor.
 */
function TrackMapCard({ trace, marks, cursor, onRemove }: { trace: LapChannelTrace; marks: readonly ChartMark[]; cursor: number | null; onRemove: () => void }) {
  const xs = trace.channels.worldX
  const zs = trace.channels.worldZ
  const throttle = trace.channels.throttle ?? []
  const brake = trace.channels.brake ?? []
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  // As tall as the track's shape asks, within reason, so a wide track leaves no empty band.
  const height = Math.min(480, Math.max(240, ((maxZ - minZ) / (maxX - minX || 1)) * (MAP_WIDTH - MAP_PAD * 2) + MAP_PAD * 2))
  const scale = Math.min((MAP_WIDTH - MAP_PAD * 2) / (maxX - minX || 1), (height - MAP_PAD * 2) / (maxZ - minZ || 1))
  const offsetX = (MAP_WIDTH - (maxX - minX) * scale) / 2
  const offsetY = (height - (maxZ - minZ) * scale) / 2
  const centre: [number, number] = [MAP_WIDTH / 2, height / 2]
  // Right-handed, Y up: from above, +X runs right and +Z runs down the screen.
  const point = (index: number): [number, number] => [offsetX + (xs[index] - minX) * scale, offsetY + (zs[index] - minZ) * scale]
  const at = (position: number): number => Math.min(xs.length - 1, Math.max(0, Math.round(position / trace.positionStep)))

  // Runs of one state as one path each, so the map is a handful of paths, not thousands of lines.
  const step = Math.max(1, Math.floor(xs.length / 1500))
  const state = (index: number): 'brake' | 'throttle' | 'coast' => ((brake[index] ?? 0) > 0.05 ? 'brake' : (throttle[index] ?? 0) > 0.9 ? 'throttle' : 'coast')
  const runs: { state: 'brake' | 'throttle' | 'coast'; d: string }[] = []
  for (let index = 0; index < xs.length; index += step) {
    const [x, y] = point(index)
    const current = state(index)
    const last = runs[runs.length - 1]
    if (last && last.state === current) last.d += ` L${x.toFixed(1)},${y.toFixed(1)}`
    else {
      const [px, py] = last ? point(Math.max(0, index - step)) : [x, y]
      runs.push({ state: current, d: `M${px.toFixed(1)},${py.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)}` })
    }
  }
  const [startX, startY] = point(0)
  const dot = cursor !== null ? point(at(cursor)) : null

  return (
    <section className="card analysis-map-card" aria-label="On the track">
      <div className="card-header">
        <h2 className="card-title">On the track</h2>
        <WidgetMenu label="Track map" onRemove={onRemove} removeLabel="Remove map" />
      </div>
      <svg viewBox={`0 0 ${MAP_WIDTH} ${height}`} className="analysis-map-svg" role="img" aria-label="The lap's line on the track">
        {runs.map((run, index) => (
          <path key={index} d={run.d} className={`analysis-map-line ${run.state}`} />
        ))}
        <circle cx={startX} cy={startY} r={4} className="analysis-map-start" />
        {marks.map((mark) => {
          // Each label sits just outside the line, away from the track's middle.
          const [x, y] = point(at(mark.position))
          const dx = x - centre[0]
          const dy = y - centre[1]
          const length = Math.hypot(dx, dy) || 1
          const anchor = dx / length > 0.35 ? 'start' : dx / length < -0.35 ? 'end' : 'middle'
          return (
            <text key={mark.label} x={x + (dx / length) * 12} y={y + (dy / length) * 12 + 4} textAnchor={anchor} className="analysis-map-label">
              {mark.label}
            </text>
          )
        })}
        {dot && <circle cx={dot[0]} cy={dot[1]} r={7} className="analysis-map-dot" />}
      </svg>
      <div className="analysis-map-keys">
        <span className="analysis-chart-legend-item">
          <LineKey tone="throttle" stroke="solid" /> Full throttle
        </span>
        <span className="analysis-chart-legend-item">
          <LineKey tone="brake" stroke="solid" /> Braking
        </span>
        <span className="analysis-chart-legend-item">
          <span className="analysis-line-key solid analysis-map-coast-key" aria-hidden="true" /> Coasting
        </span>
      </div>
    </section>
  )
}

/** The charts, each with its ⋯ menu, and "Add chart" for what was removed. */
function TelemetryCard({
  lapLabel,
  otherLabel,
  trace,
  compareWith,
  otherTrace,
  marks,
  layout,
  onLayout,
  canAddMap,
  onCursor,
}: {
  lapLabel: string
  otherLabel: string | null
  trace: LapChannelTrace
  compareWith: CorpusLap | null
  otherTrace: LapChannelTrace | null
  marks: readonly ChartMark[]
  layout: LapLayout
  onLayout: (layout: LapLayout) => void
  canAddMap: boolean
  onCursor: (position: number | null) => void
}) {
  const charts = buildLapCharts(layout, { trace, label: lapLabel }, compareWith && otherTrace && otherLabel ? { trace: otherTrace, label: otherLabel } : null)
  const hidden = hiddenCharts(layout)
  // A split pedal chart is two panels of one chart: its menu sits on the first of them only.
  const menuFor = (index: number) => {
    const owner: LapPanelOf = charts.owners[index]
    if (owner === 'delta' || charts.owners.indexOf(owner) !== index) return null
    return <ChartMenu id={owner} layout={layout} onLayout={onLayout} comparing={compareWith !== null} />
  }

  return (
    <section className="card analysis-telemetry-card" aria-label="Telemetry">
      <div className="card-header">
        <h2 className="card-title">Telemetry</h2>
      </div>
      {charts.panels.length > 0 ? (
        <LapTraceChartStack
          panels={charts.panels}
          heights={charts.heights}
          notes={charts.notes}
          marks={marks}
          actions={menuFor}
          trackLengthMeters={trace.trackLengthMeters}
          emptyText="Not recorded for this lap."
          onCursor={onCursor}
        />
      ) : (
        <p className="muted analysis-chart-empty">No charts shown. Add one below.</p>
      )}
      {(hidden.length > 0 || canAddMap) && <AddChartButton hidden={hidden} canAddMap={canAddMap} layout={layout} onLayout={onLayout} />}
    </section>
  )
}

const MENU_WIDTH = 230

/** Opens a menu from a small ⋯ button; `children` gets the close-then-act helper. */
function useMenu(width: number) {
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setMenuAt(null)
    button.current?.focus()
  }
  const open = (box: DOMRect) => setMenuAt({ x: Math.max(8, box.right - width), y: box.bottom + 4 })
  return { menuAt, button, close, open }
}

/** A chart's ⋯: together or separate and what the car got (the pedals), move, remove. */
function ChartMenu({ id, layout, onLayout, comparing }: { id: LapChartId; layout: LapLayout; onLayout: (layout: LapLayout) => void; comparing: boolean }) {
  const menu = useMenu(MENU_WIDTH)
  const index = layout.charts.indexOf(id)
  const act = (next: LapLayout) => {
    menu.close()
    onLayout(next)
  }
  const check = (on: boolean) => <Check size={14} className={on ? undefined : 'analysis-menu-check-off'} />

  return (
    <>
      <button
        ref={menu.button}
        type="button"
        className="icon-button analysis-chart-more"
        aria-label={`${LAP_CHART_TITLES[id]} options`}
        aria-haspopup="menu"
        aria-expanded={menu.menuAt !== null}
        onClick={(event) => menu.open(event.currentTarget.getBoundingClientRect())}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu.menuAt && (
        <MenuLayer anchor={menu.menuAt} label={LAP_CHART_TITLES[id]} width={MENU_WIDTH} onClose={menu.close}>
          {id === 'pedals' && (
            <>
              <button type="button" role="menuitemradio" aria-checked={!layout.pedalsSeparate} className="menu-item" disabled={comparing} onClick={() => act({ ...layout, pedalsSeparate: false })}>
                {check(!layout.pedalsSeparate && !comparing)} Together
              </button>
              <button type="button" role="menuitemradio" aria-checked={layout.pedalsSeparate} className="menu-item" disabled={comparing} onClick={() => act({ ...layout, pedalsSeparate: true })}>
                {check(layout.pedalsSeparate || comparing)} Separate
              </button>
              <button type="button" role="menuitemcheckbox" aria-checked={layout.applied} className="menu-item analysis-menu-split" disabled={comparing} onClick={() => act({ ...layout, applied: !layout.applied })}>
                {check(layout.applied && !comparing)} What the car got (ABS &amp; TC)
              </button>
            </>
          )}
          <button type="button" role="menuitem" className={id === 'pedals' ? 'menu-item analysis-menu-split' : 'menu-item'} disabled={index <= 0} onClick={() => act(moveChart(layout, id, -1))}>
            {check(false)} Move up
          </button>
          <button type="button" role="menuitem" className="menu-item" disabled={index < 0 || index >= layout.charts.length - 1} onClick={() => act(moveChart(layout, id, 1))}>
            {check(false)} Move down
          </button>
          <button type="button" role="menuitem" className="menu-item destructive analysis-menu-split" onClick={() => act(removeChart(layout, id))}>
            {check(false)} Remove chart
          </button>
        </MenuLayer>
      )}
    </>
  )
}

/** The map's ⋯: only removing it (it always sits beside the charts). */
function WidgetMenu({ label, removeLabel, onRemove }: { label: string; removeLabel: string; onRemove: () => void }) {
  const menu = useMenu(MENU_WIDTH)
  return (
    <>
      <button
        ref={menu.button}
        type="button"
        className="icon-button analysis-chart-more"
        aria-label={`${label} options`}
        aria-haspopup="menu"
        aria-expanded={menu.menuAt !== null}
        onClick={(event) => menu.open(event.currentTarget.getBoundingClientRect())}
      >
        <MoreHorizontal size={16} />
      </button>
      {menu.menuAt && (
        <MenuLayer anchor={menu.menuAt} label={label} width={MENU_WIDTH} onClose={menu.close}>
          <button
            type="button"
            role="menuitem"
            className="menu-item destructive"
            onClick={() => {
              menu.close()
              onRemove()
            }}
          >
            {removeLabel}
          </button>
        </MenuLayer>
      )}
    </>
  )
}

/** "Add chart": the removed charts, and the map when it was removed. */
function AddChartButton({ hidden, canAddMap, layout, onLayout }: { hidden: readonly LapChartId[]; canAddMap: boolean; layout: LapLayout; onLayout: (layout: LapLayout) => void }) {
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setMenuAt(null)
    button.current?.focus()
  }
  const act = (next: LapLayout) => {
    close()
    onLayout(next)
  }

  return (
    <div className="analysis-add-chart">
      <button
        ref={button}
        type="button"
        className="button subtle"
        aria-haspopup="menu"
        aria-expanded={menuAt !== null}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setMenuAt({ x: box.left, y: box.bottom + 4 })
        }}
      >
        <Plus /> Add chart
      </button>
      {menuAt && (
        <MenuLayer anchor={menuAt} label="Add chart" width={MENU_WIDTH} onClose={close}>
          {hidden.map((id) => (
            <button key={id} type="button" role="menuitem" className="menu-item" onClick={() => act(addChart(layout, id))}>
              {LAP_CHART_TITLES[id]}
            </button>
          ))}
          {canAddMap && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => act({ ...layout, map: true })}>
              Track map
            </button>
          )}
        </MenuLayer>
      )}
    </div>
  )
}

/** Keeps the lap layout in browser storage: one arrangement for every lap, per viewer. */
export function useStoredLapLayout(parse: (value: unknown) => LapLayout, initial: LapLayout): [LapLayout, (layout: LapLayout) => void] {
  const [layout, setLayout] = useState<LapLayout>(() => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_KEY)
      return raw ? parse(JSON.parse(raw)) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
    } catch {
      // Storage off (a private profile): the layout still works, it just is not remembered.
    }
  }, [layout])
  return [layout, setLayout]
}

const LAYOUT_KEY = 'sprint.analysis.lapLayout'
