import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  CHART_CURSOR_NONE,
  chartPanelState,
  chartReadoutDecimals,
  chartScaleFor,
  chartStackReadoutAt,
  formatChartReadoutValue,
  formatScaleValue,
  formatTrackPositionCursor,
} from './AnalysisDomain'
import type { ChartCursorState, ChartPanel, ChartPanelReadout, ChartSeries, SeriesStroke, SeriesTone } from './AnalysisDomain'
import { WHOLE_LAP, ZOOM_STEP, acrossWindow, dragDelta, inWindow, isZoomed, panWindow, positionInWindow, samplesInWindow, stepCursor, wheelZoomFactor, windowTicks, zoomWindow } from './AnalysisPlot'
import type { LapWindow } from './AnalysisPlot'

/**
 * The chart stack `AnalysisDomain.buildLapTraceChartPanels` computes — samples in, lines out
 * (each channel in its own `--channel-*` colour, the compared-with lap grey and dashed, what the
 * car got after ABS/TC dotted; linear interpolation for continuous channels, stepped for discrete
 * ones, no decorative smoothing, `--divider` rules, 12px secondary axis labels), plus a shared
 * hover/keyboard crosshair with a per-panel readout,
 * mirroring the old Avalonia `ChartStackView`/`ChartStackController`/`ChartStackPainter`
 * (see `git show HEAD~N:app/Sprint.Desktop.Client/Features/Charts/`).
 * <p>
 * Cursor state is the only thing this file owns locally: the computed `panels` prop is never
 * touched on pointer move, only the cursor's domain position, so a hover never re-samples a
 * trace or rebuilds a series — it only looks up where the existing samples already are
 * (`chartStackReadoutAt`).
 * <p>
 * The lap page zooms the stack: `view` is the stretch of the lap every panel shows
 * (`AnalysisPlot.ts`), and with `onView` Ctrl+wheel or a pinch zooms around the pointer, a drag pans,
 * a double-click returns to the whole lap, and +/− and ←/→ do the same at the keyboard.
 * <p>
 * The SVGs are drawn in real pixels: the stack measures its own width (ResizeObserver, only on
 * resize — nothing repaints continuously), so text and strokes are never stretched.
 */

/** Width before the first measurement (and the floor below which the plot stops shrinking). */
const DEFAULT_WIDTH = 640
const MIN_WIDTH = 240
const DEFAULT_HEIGHT = 148
const MARGIN = { top: 10, right: 12, bottom: 8, left: 44 }
/** Where every panel's plot starts and ends, for what is drawn over the stack. */
export const CHART_MARGIN = { left: MARGIN.left, right: MARGIN.right }
const AXIS_HEIGHT = 24
const MARK_HEIGHT = 18

/**
 * The plot's width inside a panel `width` px wide, and where a lap fraction lands on it with the
 * charts showing `view`: so something drawn over the stack lines up. Outside the view, beyond the plot.
 */
export const plotWidth = (width: number): number => width - MARGIN.left - MARGIN.right
export const scaleXFor = (width: number, view: LapWindow = WHOLE_LAP) => (x: number) => MARGIN.left + acrossWindow(view, x) * plotWidth(width)

/** A double-click's second click comes within this (Windows' default double-click time); a zoomed chart waits it out before a click leaves a note. */
const DOUBLE_CLICK_MS = 500
/** How far a press moves before it is a drag rather than a click. */
const DRAG_THRESHOLD_PX = 3

/** A mark along the lap drawn down every panel, e.g. a corner: where (0–1) and its short label. */
export type ChartMark = { position: number; label: string }

/** A thin line down every panel where a pin sits over the stack: solid for this lap, dashed for the lap compared with. */
export type ChartLine = { key: string; position: number; other: boolean }

const toneColor = (tone: SeriesTone): string => (tone === 'neutral' ? 'var(--label)' : `var(--channel-${tone})`)
const dashFor = (stroke: SeriesStroke): string | undefined => (stroke === 'dashed' ? '5 4' : stroke === 'dotted' ? '1.5 3' : undefined)

function buildLinePath(series: ChartSeries, scaleX: (x: number) => number, scaleY: (y: number) => number): string {
  if (series.samples.length === 0) return ''
  if (series.interpolation === 'Linear') {
    return series.samples.map((sample, index) => `${index === 0 ? 'M' : 'L'}${scaleX(sample.x).toFixed(2)},${scaleY(sample.y).toFixed(2)}`).join(' ')
  }

  // Stepped: a discrete state (e.g. gear) holds its value until the next sample rather than
  // interpolating a ratio the car never had.
  const [first, ...rest] = series.samples
  let path = `M${scaleX(first.x).toFixed(2)},${scaleY(first.y).toFixed(2)}`
  let previous = first
  for (const sample of rest) {
    path += ` L${scaleX(sample.x).toFixed(2)},${scaleY(previous.y).toFixed(2)} L${scaleX(sample.x).toFixed(2)},${scaleY(sample.y).toFixed(2)}`
    previous = sample
  }

  return path
}

function buildAreaPath(series: ChartSeries, scaleX: (x: number) => number, scaleY: (y: number) => number, baselineY: number): string {
  const line = buildLinePath(series, scaleX, scaleY)
  if (!line) return ''
  const first = series.samples[0]
  const last = series.samples[series.samples.length - 1]
  return `${line} L${scaleX(last.x).toFixed(2)},${baselineY.toFixed(2)} L${scaleX(first.x).toFixed(2)},${baselineY.toFixed(2)} Z`
}

type LegendEntry = { name: string; tone: SeriesTone; stroke: SeriesStroke }

/** Series names in series order, first occurrence only. Mirrors `ChartStackPainter.Entries`. */
function legendEntries(series: readonly ChartSeries[]): LegendEntry[] {
  const entries: LegendEntry[] = []
  for (const item of series) {
    if (!entries.some((entry) => entry.name === item.name)) entries.push({ name: item.name, tone: item.tone, stroke: item.stroke })
  }

  return entries
}

/** A line's key: its colour and its stroke (solid, dashed or dotted), so identity never rests on colour alone. */
export function LineKey({ tone, stroke }: { tone: SeriesTone; stroke: SeriesStroke }) {
  return <span className={`analysis-line-key ${stroke}`} style={{ color: toneColor(tone) }} aria-hidden="true" />
}

/** Names each line of a panel that has more than one. Mirrors `ChartStackPainter.DrawLegend`. */
function PanelLegend({ series }: { series: readonly ChartSeries[] }) {
  const entries = legendEntries(series)
  if (entries.length <= 1) return null

  return (
    <div className="analysis-chart-legend">
      {entries.map((entry) => (
        <span key={entry.name} className="analysis-chart-legend-item">
          <LineKey tone={entry.tone} stroke={entry.stroke} />
          {entry.name}
        </span>
      ))}
    </div>
  )
}

export function LapTraceChartPanel({
  panel,
  width,
  height,
  view,
  cursorPosition,
  readout,
  marks,
  lines,
  note,
  actions,
  emptyText,
  body,
}: {
  panel: ChartPanel
  width: number
  height: number
  view: LapWindow
  cursorPosition: number | null
  readout: ChartPanelReadout | null
  marks: readonly ChartMark[]
  lines: readonly ChartLine[]
  /** Quiet text after the legend, e.g. that a channel was not recorded for this lap. */
  note: string | null
  /** The panel's own controls (a ⋯ menu), at the right end of its head. */
  actions: ReactNode
  emptyText: string
  /** Drawn instead of lines, for a panel that is not a line chart (the Car settings lanes). */
  body: ReactNode
}) {
  const state = chartPanelState(panel)

  return (
    <div className="analysis-chart-panel">
      <div className="analysis-chart-head">
        <div className="analysis-chart-head-left">
          <span className="analysis-chart-title">{panel.title}</span>
          {state === 'Ready' && <PanelLegend series={panel.series} />}
          {note && <span className="analysis-chart-note">{note}</span>}
        </div>
        <div className="analysis-chart-head-right">
          {panel.unit && <span className="analysis-chart-unit">{panel.unit}</span>}
          {actions}
        </div>
      </div>
      {body ? (
        body
      ) : state !== 'Ready' ? (
        <p className="analysis-chart-empty-panel">{state === 'Empty' ? emptyText : 'Not enough samples to draw a line.'}</p>
      ) : (
        <ReadyChart panel={panel} width={width} height={height} view={view} cursorPosition={cursorPosition} readout={readout} marks={marks} lines={lines} />
      )}
    </div>
  )
}

function ReadyChart({
  panel,
  width,
  height,
  view,
  cursorPosition,
  readout,
  marks,
  lines,
}: {
  panel: ChartPanel
  width: number
  height: number
  view: LapWindow
  cursorPosition: number | null
  readout: ChartPanelReadout | null
  marks: readonly ChartMark[]
  lines: readonly ChartLine[]
}) {
  const clipId = useId()
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  // The value axis stays the whole lap's while zoomed, so panning never rescales a line under the eye.
  const values = panel.series.flatMap((series) => series.samples.map((sample) => sample.y))
  // A finer step than the HUD's, so a line fills its panel: 0–300 km/h, not 0–400.
  const scale = chartScaleFor(Math.min(...values), Math.max(...values), 4)
  const span = scale.max - scale.min || 1
  const scaleX = scaleXFor(width, view)
  // Only what the window shows is drawn, clipped to the plot so nothing runs into the axis labels.
  const drawn = panel.series.map((series) => ({ ...series, samples: samplesInWindow(series.samples, view) }))
  const shownMarks = marks.filter((mark) => inWindow(view, mark.position))
  const shownLines = lines.filter((line) => inWindow(view, line.position))
  const scaleY = (y: number) => MARGIN.top + plotHeight - ((y - scale.min) / span) * plotHeight
  const baselineY = scaleY(scale.min)
  // A gridline at every step, or every other one past five, so each label is a round value.
  const steps = Math.round((scale.max - scale.min) / scale.step)
  const every = steps > 4 ? 2 : 1
  const ticks = Array.from({ length: Math.floor(steps / every) + 1 }, (_, index) => scale.max - index * every * scale.step)

  // The readout carries more resolution than the axis: the axis states levels, the cursor
  // states the measurement the reader hovered for. Mirrors `ChartStackPainter.Decimals`.
  const decimals = chartReadoutDecimals(scale.max - scale.min)
  const showNames = panel.series.length > 1
  const cursorX = cursorPosition !== null ? scaleX(cursorPosition) : null
  const readoutRows = (readout?.series ?? []).map((series) => ({ ...series, y: series.value !== null ? scaleY(series.value) : null }))
  const presentRow = readoutRows.find((row) => row.y !== null)
  const anchorY = presentRow?.y ?? MARGIN.top + plotHeight / 2
  // Beside the crosshair, flipping to its other side rather than running off the plot.
  const chipOnLeft = cursorPosition !== null && acrossWindow(view, cursorPosition) >= 0.5

  return (
    <div className="analysis-chart-plot">
      <svg viewBox={`0 0 ${width} ${height}`} className="analysis-chart-svg" style={{ height }} role="img" aria-label={`${panel.title} trace`}>
        <defs>
          <clipPath id={clipId}>
            <rect x={MARGIN.left} y={0} width={plotWidth(width)} height={height} />
          </clipPath>
        </defs>
        {shownMarks.map((mark) => (
          <line key={mark.label} x1={scaleX(mark.position)} x2={scaleX(mark.position)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} className="analysis-chart-mark" />
        ))}
        <PinLines lines={shownLines} scaleX={scaleX} top={MARGIN.top} bottom={MARGIN.top + plotHeight} />
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={scaleY(tick)} y2={scaleY(tick)} className="analysis-chart-grid" />
            <text x={MARGIN.left - 6} y={scaleY(tick)} className="analysis-chart-axis-label tabular" textAnchor="end" dominantBaseline="middle">
              {formatScaleValue(tick, scale.step)}
            </text>
          </g>
        ))}
        <g clipPath={`url(#${clipId})`}>
          {drawn.map((series) =>
            series.fillArea ? (
              <path key={`${series.name}-fill`} d={buildAreaPath(series, scaleX, scaleY, baselineY)} fill={toneColor(series.tone)} fillOpacity={0.16} stroke="none" />
            ) : null,
          )}
          {drawn.map((series) => (
            <path
              key={series.name}
              d={buildLinePath(series, scaleX, scaleY)}
              fill="none"
              stroke={toneColor(series.tone)}
              strokeWidth={series.stroke === 'dotted' ? 2 : 1.5}
              strokeDasharray={dashFor(series.stroke)}
              strokeLinecap={series.stroke === 'dotted' ? 'round' : undefined}
            />
          ))}
        </g>
        {cursorX !== null && (
          <>
            <line x1={cursorX} x2={cursorX} y1={MARGIN.top} y2={MARGIN.top + plotHeight} className="analysis-chart-cursor-line" />
            {readoutRows.map((row) =>
              row.y !== null ? (
                <g key={row.name}>
                  <circle cx={cursorX} cy={row.y} r={5} className="analysis-chart-marker-ring" />
                  <circle cx={cursorX} cy={row.y} r={4} fill={toneColor(row.tone)} />
                </g>
              ) : null,
            )}
          </>
        )}
      </svg>
      {cursorX !== null && readoutRows.length > 0 && (
        <div
          className="analysis-chart-readout"
          style={{
            left: `${(cursorX / width) * 100}%`,
            top: `${(anchorY / height) * 100}%`,
            transform: chipOnLeft ? 'translate(calc(-100% - 8px), -50%)' : 'translate(8px, -50%)',
          }}
        >
          {readoutRows.map((row) => (
            <div key={row.name} className="analysis-chart-readout-row">
              <LineKey tone={row.tone} stroke={row.stroke} />
              {/* The value leads and the series name follows: the reader already knows which
                  series they are on and came for the number. */}
              <span className="analysis-chart-readout-value tabular">{row.value !== null ? formatChartReadoutValue(row.value, decimals) : '—'}</span>
              {showNames && <span className="muted">{row.name}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The pins' lines down one panel, from `top` to `bottom` in its SVG. */
export function PinLines({ lines, scaleX, top, bottom }: { lines: readonly ChartLine[]; scaleX: (x: number) => number; top: number; bottom: number }) {
  return (
    <>
      {lines.map((line) => (
        <line key={line.key} x1={scaleX(line.position)} x2={scaleX(line.position)} y1={top} y2={bottom} className={line.other ? 'analysis-pin-line other' : 'analysis-pin-line'} />
      ))}
    </>
  )
}

/** Where the cursor is along the lap: in km when the track's length is known, as a share of the lap otherwise. */
const cursorLabel = (fraction: number, trackLengthMeters: number | null): string =>
  trackLengthMeters === null ? formatTrackPositionCursor(fraction) : `${((fraction * trackLengthMeters) / 1000).toFixed(2)} km`

/** The corner labels in view, once above the whole stack, over the marks every panel draws. */
function MarkRow({ width, view, marks }: { width: number; view: LapWindow; marks: readonly ChartMark[] }) {
  const scaleX = scaleXFor(width, view)
  return (
    <svg viewBox={`0 0 ${width} ${MARK_HEIGHT}`} className="analysis-chart-mark-svg" style={{ height: MARK_HEIGHT }} role="presentation" aria-hidden="true">
      {marks.filter((mark) => inWindow(view, mark.position)).map((mark) => (
        <text key={mark.label} x={scaleX(mark.position)} y={MARK_HEIGHT / 2} className="analysis-chart-mark-label" textAnchor="middle" dominantBaseline="middle">
          {mark.label}
        </text>
      ))}
    </svg>
  )
}

/** The shared X axis, drawn once under the whole stack, in the same coordinate space every panel's crosshair uses. */
function AxisRow({ width, view, cursorPosition, trackLengthMeters }: { width: number; view: LapWindow; cursorPosition: number | null; trackLengthMeters: number | null }) {
  const scaleX = scaleXFor(width, view)
  const cursorX = cursorPosition !== null ? scaleX(cursorPosition) : null
  const cursorText = cursorPosition !== null ? cursorLabel(cursorPosition, trackLengthMeters) : ''
  const chipWidth = cursorText.length * 7.5 + 14
  const chipLeft = cursorX !== null ? Math.min(Math.max(cursorX - chipWidth / 2, MARGIN.left), width - MARGIN.right - chipWidth) : 0

  return (
    <svg viewBox={`0 0 ${width} ${AXIS_HEIGHT}`} className="analysis-chart-axis-svg" role="presentation" aria-hidden="true">
      {windowTicks(view, trackLengthMeters).map((tick) => (
        <text
          key={tick.across}
          x={scaleX(tick.position)}
          y={AXIS_HEIGHT / 2}
          className="analysis-chart-axis-label tabular"
          textAnchor={tick.across <= 0 ? 'start' : tick.across >= 1 ? 'end' : 'middle'}
          dominantBaseline="middle"
        >
          {tick.label}
        </text>
      ))}
      {cursorX !== null && (
        <g>
          <rect x={chipLeft} y={2} width={chipWidth} height={AXIS_HEIGHT - 4} rx={4} className="analysis-chart-cursor-chip" />
          <text x={chipLeft + chipWidth / 2} y={AXIS_HEIGHT / 2} className="analysis-chart-cursor-chip-label tabular" textAnchor="middle" dominantBaseline="middle">
            {cursorText}
          </text>
        </g>
      )}
    </svg>
  )
}

/**
 * The stack: same X domain (track position) down every panel, one shared cursor, one axis row at
 * the bottom. Optional: corner `marks` down every panel, a height, a quiet note and controls per
 * panel (by index), km on the axis, and `onCursor` for something outside that follows the cursor
 * (the track map's dot). The lap page adds a row over the stack (`top`, its pins), their `lines`
 * down every panel, a `body` for a panel that is not lines, `onPick` for a click (or Enter)
 * at a place on the lap, and the stretch of the lap shown (`view`, changed through `onView`).
 */
export function LapTraceChartStack({
  panels,
  heights,
  marks = [],
  notes,
  actions,
  trackLengthMeters = null,
  emptyText = 'Not recorded on either lap.',
  onCursor,
  top,
  lines = [],
  body,
  onPick,
  view = WHOLE_LAP,
  onView,
}: {
  panels: readonly ChartPanel[]
  heights?: readonly number[]
  marks?: readonly ChartMark[]
  notes?: readonly (string | null)[]
  actions?: (index: number) => ReactNode
  trackLengthMeters?: number | null
  emptyText?: string
  onCursor?: (position: number | null) => void
  /** Drawn over the stack, above the corner labels, at the stack's measured width. */
  top?: (width: number) => ReactNode
  lines?: readonly ChartLine[]
  /** A panel's own drawing (by index) in place of its lines; null for a line chart. */
  body?: (index: number, width: number, cursorPosition: number | null) => ReactNode
  /** A place on the lap was picked: a click on a plot, or Enter at the keyboard cursor. */
  onPick?: (position: number) => void
  /** The stretch of the lap every panel shows; the whole lap by default. */
  view?: LapWindow
  /** With it, the stack zooms and pans: Ctrl+wheel or a pinch, a drag once zoomed, a double-click, +/− and ←/→. */
  onView?: (view: LapWindow) => void
}) {
  const [cursor, setCursorState] = useState<ChartCursorState>(CHART_CURSOR_NONE)
  const [panning, setPanning] = useState(false)
  const width = useMeasuredWidth()
  const drag = useRef<{ pointerId: number; startX: number; startView: LapWindow; moved: boolean } | null>(null)
  // The click a drag ends with is not a pick.
  const dragged = useRef(false)
  // A zoomed stack waits out a double-click before a click picks a place.
  const pendingPick = useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoomed = isZoomed(view)
  const cursorPosition = cursor.kind === 'at' ? cursor.position : null
  const readout = cursorPosition !== null ? chartStackReadoutAt(panels, cursorPosition) : null
  const setCursor = (next: ChartCursorState) => {
    setCursorState(next)
    onCursor?.(next.kind === 'at' ? next.position : null)
  }
  const cancelPick = () => {
    if (pendingPick.current !== null) clearTimeout(pendingPick.current)
    pendingPick.current = null
  }
  useEffect(() => cancelPick, [])

  /** The lap position under a pointer at `clientX`, kept on the plot. */
  const positionAt = (clientX: number): number => {
    const rect = width.element?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return view.from
    const x = ((clientX - rect.left) / rect.width) * width.value
    return positionInWindow(view, Math.min(1, Math.max(0, (x - MARGIN.left) / plotWidth(width.value))))
  }
  const positionFromPointer = (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement>): number => positionAt(event.clientX)

  // Ctrl+wheel zooms around the pointer; Chromium sends a trackpad pinch as a Ctrl wheel, so a
  // pinch zooms too. A plain wheel scrolls the page, except a sideways scroll pans a zoomed stack.
  // A native listener, because React's is passive and could not stop the page scrolling or zooming.
  useEffect(() => {
    const element = width.element
    if (!element || !onView) return
    const onWheel = (event: WheelEvent) => {
      if (onControls(event.target)) return
      const pixels = (delta: number): number => (event.deltaMode === 1 ? delta * 16 : event.deltaMode === 2 ? delta * element.clientHeight : delta)
      const sideways = pixels(event.deltaX)
      const down = pixels(event.deltaY)
      if (event.ctrlKey) {
        event.preventDefault()
        onView(zoomWindow(view, wheelZoomFactor(down), positionAt(event.clientX)))
        return
      }
      if (Math.abs(sideways) > Math.abs(down) && isZoomed(view)) {
        event.preventDefault()
        onView(panWindow(view, dragDelta(view, -sideways, plotWidth(width.value))))
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [width.element, width.value, view, onView])

  const zoomByKey = (factor: number) => {
    if (!onView) return
    const anchor = cursorPosition !== null && inWindow(view, cursorPosition) ? cursorPosition : positionInWindow(view, 0.5)
    onView(zoomWindow(view, factor, anchor))
  }

  return (
    <div
      ref={width.ref}
      className={`analysis-chart-stack${onView && zoomed ? ' zoomed' : ''}${panning ? ' panning' : ''}`}
      tabIndex={0}
      role="group"
      aria-label={
        onView
          ? 'Lap chart. Hover, or use the arrow keys while focused, to read values at a track position. Ctrl+scroll, pinch or press plus and minus to zoom, drag to move along the lap, double-click for the whole lap.'
          : 'Lap chart. Hover, or use the arrow keys while focused, to read values at a track position.'
      }
      onPointerDown={(event) => {
        dragged.current = false
        if (!onView || !zoomed || event.button !== 0 || onControls(event.target)) return
        drag.current = { pointerId: event.pointerId, startX: event.clientX, startView: view, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const pan = drag.current
        if (pan && pan.pointerId === event.pointerId && onView) {
          const rect = event.currentTarget.getBoundingClientRect()
          const pixels = rect.width > 0 ? ((event.clientX - pan.startX) / rect.width) * width.value : 0
          if (pan.moved || Math.abs(pixels) >= DRAG_THRESHOLD_PX) {
            if (!pan.moved) setPanning(true)
            pan.moved = true
            onView(panWindow(pan.startView, dragDelta(pan.startView, pixels, plotWidth(width.value))))
          }
        }
        if (onControls(event.target)) return
        setCursor({ kind: 'at', position: positionFromPointer(event) })
      }}
      onPointerUp={(event) => {
        const pan = drag.current
        if (!pan || pan.pointerId !== event.pointerId) return
        dragged.current = pan.moved
        drag.current = null
        setPanning(false)
      }}
      onPointerCancel={() => {
        drag.current = null
        setPanning(false)
      }}
      onPointerLeave={() => setCursor(CHART_CURSOR_NONE)}
      onClick={(event) => {
        if (dragged.current) {
          dragged.current = false
          return
        }
        // The second click of a double-click is the double-click's.
        if (!onPick || onControls(event.target) || event.detail > 1) return
        const position = positionFromPointer(event)
        if (!onView || !zoomed) {
          onPick(position)
          return
        }
        cancelPick()
        pendingPick.current = setTimeout(() => {
          pendingPick.current = null
          onPick(position)
        }, DOUBLE_CLICK_MS)
      }}
      onDoubleClick={(event) => {
        if (!onView || onControls(event.target)) return
        cancelPick()
        if (zoomed) onView(WHOLE_LAP)
      }}
      onKeyDown={(event) => {
        // Keys pressed on a control inside the stack (a pin, a ⋯) belong to that control.
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' && onPick && cursorPosition !== null) {
          event.preventDefault()
          onPick(cursorPosition)
          return
        }
        if (onView && (event.key === '+' || event.key === '=')) {
          event.preventDefault()
          zoomByKey(1 / ZOOM_STEP)
          return
        }
        if (onView && (event.key === '-' || event.key === '_')) {
          event.preventDefault()
          zoomByKey(ZOOM_STEP)
          return
        }
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        // The crosshair moves; zoomed, the window pans along when it would leave it.
        const step = stepCursor(view, cursorPosition, event.key === 'ArrowLeft' ? -1 : 1)
        setCursor({ kind: 'at', position: step.cursor })
        if (step.view !== view) onView?.(step.view)
      }}
    >
      {top?.(width.value)}
      {marks.length > 0 && <MarkRow width={width.value} view={view} marks={marks} />}
      {panels.map((panel, index) => (
        <LapTraceChartPanel
          key={panel.title}
          panel={panel}
          width={width.value}
          height={heights?.[index] ?? DEFAULT_HEIGHT}
          view={view}
          cursorPosition={cursorPosition}
          readout={readout?.panels[index] ?? null}
          marks={marks}
          lines={lines}
          note={notes?.[index] ?? null}
          actions={actions?.(index)}
          emptyText={emptyText}
          body={body?.(index, width.value, cursorPosition)}
        />
      ))}
      <AxisRow width={width.value} view={view} cursorPosition={cursorPosition} trackLengthMeters={trackLengthMeters} />
    </div>
  )
}

/** A pointer over a panel's own controls (its ⋯ menu) or over the pins is not a reading. */
const onControls = (target: EventTarget | null): boolean => target instanceof Element && target.closest('.analysis-chart-head, .analysis-pins') !== null

/** The stack's own content width in CSS pixels, updated on resize only, and the element measured. */
function useMeasuredWidth(): { ref: (element: HTMLDivElement | null) => void; value: number; element: HTMLDivElement | null } {
  const [value, setValue] = useState(DEFAULT_WIDTH)
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const latest = useRef(value)

  useLayoutEffect(() => {
    if (!element) return
    const measure = () => {
      const next = Math.max(MIN_WIDTH, Math.round(element.clientWidth))
      if (next !== latest.current) {
        latest.current = next
        setValue(next)
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  return { ref: setElement, value, element }
}
