import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, Crosshair, GitCompareArrows, MoreHorizontal, Plus, X } from 'lucide-react'
import type { SprintCommand } from '../bridge'
import { tyreHeat } from '../pitwall/carDomain'
import { CarSvg } from '../pitwall/tiles/CarSvg'
import { CORNER_NAMES, carHere } from './AnalysisCar'
import type { CornerHere } from './AnalysisCar'
import { buildAddLapNote, buildDeleteLapNote, buildUpdateLapNote, carLine, formatGap, formatLapSeconds, fuelText, tyreText } from './AnalysisDomain'
import type { CorpusLap, CorpusRun, CorpusSession, LapChannelTrace, LapNote, TraceGrid } from './AnalysisDomain'
import { LapTraceChartStack, LineKey } from './AnalysisChart'
import type { ChartMark } from './AnalysisChart'
import { buildLapCharts, chartRecorded, lapCorners, verdict } from './AnalysisLapCharts'
import type { LapPanelOf } from './AnalysisLapCharts'
import { LAP_CHART_GROUPS, LAP_CHART_TITLES, TYRE_BANDS, moveChart, removeChart, storedLapLayout, toggleChart } from './AnalysisLapLayout'
import type { LapChartId, LapLayout } from './AnalysisLapLayout'
import { lapMeters, lapPins, placeLabel, settingChanges } from './AnalysisLapMarks'
import { CarSettingsLanes, NoteBubble, NoteEditor, PinRows, pinLines, pinRowsHeight, popoverLeft } from './AnalysisLapPins'
import type { PinRow } from './AnalysisLapPins'
import { MenuLayer, type MenuAnchor } from '../shell/Menu'
import { FriendBadge, shortDay } from './OnTrackPages'
import { sameLap } from './OnTrackLaps'
import { useLapTrace } from './useLapTrace'

/**
 * Analysis's third page: one lap, on its own. Where it went on the track (the map) and the car
 * at the charts' cursor (tyres, brakes, fuel, damage) beside its channels, each chart arranged by
 * the driver (its ⋯ menu, "Add chart", a click on one of the car's values). Comparing is a choice:
 * "Compare with…" picks another lap with this car on this track — yours first, then shared ones —
 * and it joins every chart grey and dashed until "Stop comparing". Pins over the charts mark where
 * a car setting changed or a note was left (both laps' when comparing); a click on the charts
 * leaves a note there (`onNote` sends it and says whether the host took it).
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
  onNote,
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
  onNote: (command: SprintCommand) => Promise<boolean>
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
          <p className="list-card-empty">This lap’s line could not be read.</p>
        </div>
      ) : (
        <LapBody
          lap={lap}
          onNote={onNote}
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

/** The map and the car beside the charts, or the charts alone when both are off. */
function LapBody({
  lap,
  onNote,
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
  lap: CorpusLap
  onNote: (command: SprintCommand) => Promise<boolean>
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
  // The car card keeps showing the last place the cursor was once the pointer leaves the charts.
  const [here, setHere] = useState(0)
  const marks = lapCorners(trace)
  const hasMap = 'worldX' in trace.channels && 'worldZ' in trace.channels
  const showMap = layout.map && hasMap
  const carAt = cursor ?? here
  return (
    <div className={showMap || layout.car ? 'analysis-lap-body with-side' : 'analysis-lap-body'}>
      {(showMap || layout.car) && (
        <div className="analysis-lap-side">
          {showMap && <TrackMapCard trace={trace} marks={marks} cursor={cursor} onRemove={() => onLayout({ ...layout, map: false })} />}
          {layout.car && <CarCard car={trace.car} position={carAt} place={placeLabel(carAt, lapMeters(trace, lap), marks)} layout={layout} onLayout={onLayout} />}
        </div>
      )}
      <TelemetryCard
        lap={lap}
        onNote={onNote}
        lapLabel={lapLabel}
        otherLabel={otherLabel}
        trace={trace}
        compareWith={compareWith}
        otherTrace={otherTrace}
        marks={marks}
        layout={layout}
        onLayout={onLayout}
        hasMap={hasMap}
        onCursor={(position) => {
          onCursor(position)
          if (position !== null) setHere(position)
        }}
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

// The car drawing's own units (`CarSvg`, 200 wide): each tyre drawn large beside its corner.
const TYRE = { width: 68, height: 96, band: 20, gap: 2, left: -62, right: 194, front: 44, rear: 288 }

/** A tyre across its tread in the pit wall's heat colours, the inner side facing the car; under it, what stands out about the wheel. */
function TyreBands({ corner }: { corner: CornerHere }) {
  const left = corner.corner.endsWith('L')
  const x = left ? TYRE.left : TYRE.right
  const y = corner.corner.startsWith('F') ? TYRE.front : TYRE.rear
  const across = left ? [corner.outer, corner.middle, corner.inner] : [corner.inner, corner.middle, corner.outer]
  return (
    <g>
      <rect x={x} y={y - 2} width={TYRE.width} height={TYRE.height + 4} rx={9} className="analysis-car-tyre" />
      {across.map((celsius, index) => (
        <rect
          key={index}
          x={x + TYRE.gap + index * (TYRE.band + TYRE.gap)}
          y={y}
          width={TYRE.band}
          height={TYRE.height}
          rx={index === 1 ? 0 : 7}
          className={celsius === null ? 'analysis-heat none' : `analysis-heat ${tyreHeat(celsius)}`}
        />
      ))}
      {corner.state && (
        <text x={x + TYRE.width / 2} y={y + TYRE.height + 26} textAnchor="middle" className="analysis-car-state">
          {corner.state}
        </text>
      )}
    </g>
  )
}

const HEAT_KEYS = [
  ['cold', 'Cold'],
  ['ok', 'In window'],
  ['warm', 'Warm'],
  ['hot', 'Hot'],
] as const

const whole = (value: number | null): string => (value === null ? '—' : String(Math.round(value)))

/**
 * The whole car at one place on the lap: each tyre across its tread, its pressure, brake and
 * tread, then the engine, the fuel, the ride height and the damage. It follows the charts' cursor.
 * A click on a value puts its chart on the page, a second one takes it off again.
 */
function CarCard({ car, position, place, layout, onLayout }: { car: TraceGrid | null; position: number; place: string; layout: LapLayout; onLayout: (layout: LapLayout) => void }) {
  const value = (chart: LapChartId, text: string, label: string) => {
    const on = layout.charts.includes(chart)
    return (
      <button
        type="button"
        className="analysis-car-value tabular"
        aria-pressed={on}
        aria-label={label}
        title={on ? `Remove the ${LAP_CHART_TITLES[chart]} chart` : `Show ${LAP_CHART_TITLES[chart]} as a chart`}
        onClick={() => onLayout(toggleChart(layout, chart))}
      >
        {text}
      </button>
    )
  }
  const reading = car ? carHere(car, position) : null

  return (
    <section className="card analysis-car-card" aria-label="The car here">
      <div className="card-header">
        <h2 className="card-title">The car here</h2>
        <div className="analysis-car-head">
          {reading && <span className="analysis-secondary tabular">{place}</span>}
          <WidgetMenu label="The car" removeLabel="Remove car" onRemove={() => onLayout({ ...layout, car: false })} />
        </div>
      </div>
      {reading === null ? (
        <p className="list-card-empty">Not recorded for this lap. Laps driven from now on keep what the car reports.</p>
      ) : (
        <>
          <div className="analysis-car">
            {reading.corners.map((corner) => {
              const name = CORNER_NAMES[corner.corner]
              const left = corner.corner.endsWith('L')
              const across = left ? [corner.outer, corner.middle, corner.inner] : [corner.inner, corner.middle, corner.outer]
              return (
                <div key={corner.corner} className={`analysis-car-corner ${corner.corner.toLowerCase()}`}>
                  <span className="analysis-car-name">{name}</span>
                  {value(
                    'tyreTemp',
                    `${across.map(whole).join(' ')}°`,
                    `${name} tyre across the tread, ${left ? 'outside to inside' : 'inside to outside'}: ${across.map(whole).join(', ')} degrees`,
                  )}
                  {value('tyrePressure', `${whole(corner.pressureKPa)} kPa`, `${name} tyre pressure: ${whole(corner.pressureKPa)} kilopascal`)}
                  {value('brakeTemp', `${whole(corner.brakeCelsius)}° brake`, `${name} brake: ${whole(corner.brakeCelsius)} degrees`)}
                  {value('tyreWear', `${whole(corner.treadPercent)}% tread`, `${name} tyre: ${whole(corner.treadPercent)} per cent tread left`)}
                </div>
              )
            })}
            <div className="analysis-car-drawing">
              <CarSvg
                label="The car from above, nose up"
                wheelClass={{ fl: 'analysis-car-wheel', fr: 'analysis-car-wheel', rl: 'analysis-car-wheel', rr: 'analysis-car-wheel' }}
                extra={reading.corners.map((corner) => (
                  <TyreBands key={corner.corner} corner={corner} />
                ))}
              />
            </div>
          </div>
          <div className="analysis-car-keys">
            {HEAT_KEYS.map(([heat, name]) => (
              <span key={heat} className="analysis-chart-legend-item">
                <span className={`analysis-heat-key analysis-heat ${heat}`} aria-hidden="true" /> {name}
              </span>
            ))}
          </div>
          <div className="analysis-car-facts">
            {reading.facts.map((fact) => (
              <div key={fact.label} className="analysis-car-fact">
                <span className="analysis-car-name">{fact.label}</span>
                {fact.chart ? value(fact.chart, fact.text, `${fact.label}: ${fact.text}`) : <span className="analysis-car-still tabular">{fact.text}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

/** An open layer over the charts: a note being written, one being read, or one being rewritten. */
type NoteLayer =
  | { kind: 'new'; position: number }
  | { kind: 'read'; note: LapNote; lap: CorpusLap; position: number; other: boolean }
  | { kind: 'edit'; note: LapNote; lap: CorpusLap; position: number }

/**
 * The charts, each with its ⋯ menu, and "Add chart" for every other one. Over them, a row of pins
 * per lap; a click on the charts (or Enter at the keyboard cursor) writes a note there.
 */
function TelemetryCard({
  lap,
  onNote,
  lapLabel,
  otherLabel,
  trace,
  compareWith,
  otherTrace,
  marks,
  layout,
  onLayout,
  hasMap,
  onCursor,
}: {
  lap: CorpusLap
  onNote: (command: SprintCommand) => Promise<boolean>
  lapLabel: string
  otherLabel: string | null
  trace: LapChannelTrace
  compareWith: CorpusLap | null
  otherTrace: LapChannelTrace | null
  marks: readonly ChartMark[]
  layout: LapLayout
  onLayout: (layout: LapLayout) => void
  hasMap: boolean
  onCursor: (position: number | null) => void
}) {
  const [layer, setLayer] = useState<NoteLayer | null>(null)
  const compared = compareWith && otherTrace && otherLabel ? { lap: compareWith, trace: otherTrace, label: otherLabel } : null
  const comparedTrace = compared?.trace ?? null
  const comparedLabel = compared?.label ?? null
  // The page draws again whenever the cursor moves; the charts change only with what they draw.
  const charts = useMemo(
    () => buildLapCharts(layout, { trace, label: lapLabel }, comparedTrace && comparedLabel !== null ? { trace: comparedTrace, label: comparedLabel } : null),
    [layout, trace, lapLabel, comparedTrace, comparedLabel],
  )
  const meters = lapMeters(trace, lap)
  const placeOf = (position: number) => placeLabel(position, meters, marks)

  // Compared, each row is named (a friend by first name, to fit beside the axis); alone, the one
  // row needs no name. A row with no pin is left out.
  const rowLabel = (of: CorpusLap, label: string) => (of.sharedFrom ? (of.sharedFrom.trim().split(/\s+/)[0] ?? label) : label)
  const rows: PinRow[] = [
    { key: 'mine', label: compared ? rowLabel(lap, lapLabel) : null, other: false, pins: lapPins(settingChanges(trace), lap.notes, meters) },
    ...(compared
      ? [{ key: 'other', label: rowLabel(compared.lap, compared.label), other: true, pins: lapPins(settingChanges(compared.trace), compared.lap.notes, lapMeters(compared.trace, compared.lap)) }]
      : []),
  ].filter((row) => row.pins.length > 0)
  const lines = pinLines(rows)

  // A split pedal chart is two panels of one chart: its menu sits on the first of them only.
  const menuFor = (index: number) => {
    const owner: LapPanelOf = charts.owners[index]
    if (owner === 'delta' || charts.owners.indexOf(owner) !== index) return null
    return <ChartMenu id={owner} layout={layout} onLayout={onLayout} comparing={compareWith !== null} />
  }

  // A click on the charts closes a note being read; with none open it starts one there. A note
  // being written keeps its place until it is saved or cancelled.
  const pick = (position: number) => {
    if (layer?.kind === 'new' || layer?.kind === 'edit') return
    setLayer(layer ? null : { kind: 'new', position })
  }
  const send = async (command: SprintCommand) => {
    const sent = await onNote(command)
    if (sent) setLayer(null)
    return sent
  }

  const drawLayer = (width: number) => {
    if (!layer) return null
    const style = { left: popoverLeft(layer.position, width), top: pinRowsHeight(rows) + 4 }
    return (
      <div className="analysis-note-layer" style={style}>
        {layer.kind === 'new' ? (
          <NoteEditor title="New note" place={placeOf(layer.position)} initial="" onCancel={() => setLayer(null)} onSave={(text) => send(buildAddLapNote(lap, layer.position * meters, text))} />
        ) : layer.kind === 'edit' ? (
          <NoteEditor
            title="Edit note"
            place={placeOf(layer.position)}
            initial={layer.note.text}
            onCancel={() => setLayer(null)}
            onSave={(text) => send(buildUpdateLapNote(layer.lap, layer.note.id, text))}
          />
        ) : (
          <NoteBubble
            note={layer.note}
            place={placeOf(layer.position)}
            lapName={layer.other ? (compared?.label ?? null) : null}
            onClose={() => setLayer(null)}
            onEdit={() => setLayer({ kind: 'edit', note: layer.note, lap: layer.lap, position: layer.position })}
            onDelete={() => void send(buildDeleteLapNote(layer.lap, layer.note.id))}
          />
        )}
      </div>
    )
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
          lines={lines}
          onPick={pick}
          top={(width) => (
            <div className="analysis-pins" style={{ height: pinRowsHeight(rows) }}>
              <PinRows
                rows={rows}
                width={width}
                placeOf={placeOf}
                openNoteId={layer?.kind === 'read' ? layer.note.id : null}
                onNote={(note, row, position) =>
                  setLayer(layer?.kind === 'read' && layer.note.id === note.id ? null : { kind: 'read', note, lap: row.other && compared ? compared.lap : lap, position, other: row.other })
                }
              />
              {drawLayer(width)}
            </div>
          )}
          body={(index, width, cursorPosition) =>
            charts.owners[index] === 'settings' && charts.settings ? (
              <CarSettingsLanes chart={charts.settings} width={width} height={charts.heights[index]} cursorPosition={cursorPosition} lines={lines} compared={compared !== null} />
            ) : null
          }
        />
      ) : (
        <p className="list-card-empty">No charts shown. Add one below.</p>
      )}
      <AddChartButton trace={trace} hasMap={hasMap} layout={layout} onLayout={onLayout} />
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

/** A chart's ⋯: together or separate and what the car got (the pedals), which temperature (the tyres), move, remove. */
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
          {id === 'tyreTemp' &&
            TYRE_BANDS.map((band) => (
              <button key={band} type="button" role="menuitemradio" aria-checked={layout.tyreBand === band} className="menu-item" onClick={() => act({ ...layout, tyreBand: band })}>
                {check(layout.tyreBand === band)} {band === 'Core' ? 'Core' : `${band} of the tread`}
              </button>
            ))}
          <button
            type="button"
            role="menuitem"
            className={id === 'pedals' || id === 'tyreTemp' ? 'menu-item analysis-menu-split' : 'menu-item'}
            disabled={index <= 0}
            onClick={() => act(moveChart(layout, id, -1))}
          >
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

/** The ⋯ of a card beside the charts (the map, the car): only removing it. */
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

const ADD_MENU = { width: 720, height: 236 }
// The menu's four columns, by group of `LAP_CHART_GROUPS`: Driving · Engine & fuel, Brakes · Tyres, Beside the charts · Chassis, Grip.
const ADD_COLUMNS: Record<string, number> = { Driving: 1, 'Engine & fuel': 2, Brakes: 2, Tyres: 3, Chassis: 4, Grip: 4 }

/**
 * "Add chart": every chart by part of the car, each with a tick while it is on the page (a tick
 * adds it under the others, a second one takes it off), and the two cards beside the charts. A
 * chart this lap did not record cannot be added from it. The menu stays open, to tick several.
 */
function AddChartButton({ trace, hasMap, layout, onLayout }: { trace: LapChannelTrace; hasMap: boolean; layout: LapLayout; onLayout: (layout: LapLayout) => void }) {
  const [menuAt, setMenuAt] = useState<MenuAnchor | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const close = () => {
    setMenuAt(null)
    button.current?.focus()
  }
  const check = (on: boolean) => <Check size={14} className={on ? undefined : 'analysis-menu-check-off'} />
  const item = (key: string, name: string, on: boolean, available: boolean, why: string, toggle: () => void) => (
    <button key={key} type="button" role="menuitemcheckbox" aria-checked={on} className="menu-item" disabled={!on && !available} title={!on && !available ? why : undefined} onClick={toggle}>
      {check(on)} {name}
    </button>
  )
  // A group starts its column, or follows another group in it under a rule.
  const head = (title: string, starts: boolean) => (
    <div key={title} className={starts ? 'analysis-pick-head analysis-add-head starts' : 'analysis-pick-head analysis-add-head'}>
      {title}
    </div>
  )
  // In the order of the columns: the menu flows down one and on to the next, and so do the arrow keys.
  const groups = [...LAP_CHART_GROUPS].sort((a, b) => (ADD_COLUMNS[a.title] ?? 1) - (ADD_COLUMNS[b.title] ?? 1))
  const startsColumn = (title: string) => groups.find((group) => ADD_COLUMNS[group.title] === ADD_COLUMNS[title])?.title === title

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
          // Under the button, or over it when the page ends right below.
          setMenuAt({ x: box.left, y: window.innerHeight - box.bottom < ADD_MENU.height + 12 ? Math.max(8, box.top - ADD_MENU.height - 4) : box.bottom + 4 })
        }}
      >
        <Plus /> Add chart
      </button>
      {menuAt && (
        <MenuLayer anchor={menuAt} label="Add chart" width={ADD_MENU.width} onClose={close}>
          {groups.flatMap((group) => [
            head(group.title, startsColumn(group.title)),
            ...group.charts.map((chart) =>
              item(chart.id, chart.name, layout.charts.includes(chart.id), chartRecorded(chart.id, trace), 'Not recorded for this lap', () => onLayout(toggleChart(layout, chart.id))),
            ),
            // The two cards beside the charts close the Tyres column.
            ...(group.title === 'Tyres'
              ? [
                  head('Beside the charts', false),
                  item('map', 'Track map', layout.map && hasMap, hasMap, 'This lap has no positions to draw', () => onLayout({ ...layout, map: !layout.map })),
                  item('car', 'The car', layout.car, true, '', () => onLayout({ ...layout, car: !layout.car })),
                ]
              : []),
          ])}
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
      window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(storedLapLayout(layout)))
    } catch {
      // Storage off (a private profile): the layout still works, it just is not remembered.
    }
  }, [layout])
  return [layout, setLayout]
}

const LAYOUT_KEY = 'sprint.analysis.lapLayout'
