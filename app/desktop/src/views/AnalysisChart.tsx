import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  CHART_CURSOR_NONE,
  chartPanelState,
  chartReadoutDecimals,
  chartScaleFor,
  chartStackReadoutAt,
  formatChartReadoutValue,
  formatScaleValue,
  formatTrackPosition,
  formatTrackPositionCursor,
  moveChartCursorByKey,
} from './AnalysisDomain'
import type { ChartCursorState, ChartPanel, ChartPanelReadout, ChartSeries, ChartSeriesRole } from './AnalysisDomain'

/**
 * The chart stack `AnalysisDomain.buildLapTraceChartPanels` computes — samples in, lines out
 * (docs/design/design-system/DESIGN.md "Charts": brand-500 for the current/selected series,
 * blue-500 for comparison, linear interpolation for continuous channels, stepped for discrete
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
 * The SVGs are drawn in real pixels: the stack measures its own width (ResizeObserver, only on
 * resize — nothing repaints continuously), so text and strokes are never stretched.
 */

/** Width before the first measurement (and the floor below which the plot stops shrinking). */
const DEFAULT_WIDTH = 640
const MIN_WIDTH = 240
const HEIGHT = 148
const MARGIN = { top: 10, right: 12, bottom: 8, left: 44 }
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const AXIS_HEIGHT = 24
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1]

const plotWidth = (width: number): number => width - MARGIN.left - MARGIN.right
const scaleXFor = (width: number) => (x: number) => MARGIN.left + x * plotWidth(width)

const seriesColor = (role: ChartSeriesRole): string => (role === 'Comparison' ? 'var(--blue-500)' : 'var(--brand-500)')

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

/** Series names/roles in series order, first occurrence only. Mirrors `ChartStackPainter.Entries`. */
function legendEntries(series: readonly ChartSeries[]): { name: string; role: ChartSeriesRole }[] {
  const entries: { name: string; role: ChartSeriesRole }[] = []
  for (const item of series) {
    if (!entries.some((entry) => entry.name === item.name && entry.role === item.role)) entries.push({ name: item.name, role: item.role })
  }

  return entries
}

/** Identifies which line is which lap — brand for primary, blue for comparison. Mirrors `ChartStackPainter.DrawLegend`. */
function PanelLegend({ series }: { series: readonly ChartSeries[] }) {
  const entries = legendEntries(series)
  if (entries.length <= 1) return null

  return (
    <div className="analysis-chart-legend">
      {entries.map((entry) => (
        <span key={`${entry.role}-${entry.name}`} className="analysis-chart-legend-item">
          <span className="analysis-chart-legend-key" style={{ background: seriesColor(entry.role) }} />
          {entry.name}
        </span>
      ))}
    </div>
  )
}

export function LapTraceChartPanel({
  panel,
  width,
  cursorPosition,
  readout,
}: {
  panel: ChartPanel
  width: number
  cursorPosition: number | null
  readout: ChartPanelReadout | null
}) {
  const state = chartPanelState(panel)

  return (
    <div className="analysis-chart-panel">
      <div className="analysis-chart-head">
        <span className="analysis-chart-title">{panel.title}</span>
        <div className="analysis-chart-head-right">
          {panel.unit && <span className="analysis-chart-unit">{panel.unit}</span>}
          {state === 'Ready' && <PanelLegend series={panel.series} />}
        </div>
      </div>
      {state !== 'Ready' ? (
        <p className="analysis-chart-empty-panel">{state === 'Empty' ? 'Not recorded on either lap.' : 'Not enough samples to draw a line.'}</p>
      ) : (
        <ReadyChart panel={panel} width={width} cursorPosition={cursorPosition} readout={readout} />
      )}
    </div>
  )
}

function ReadyChart({
  panel,
  width,
  cursorPosition,
  readout,
}: {
  panel: ChartPanel
  width: number
  cursorPosition: number | null
  readout: ChartPanelReadout | null
}) {
  const values = panel.series.flatMap((series) => series.samples.map((sample) => sample.y))
  const scale = chartScaleFor(Math.min(...values), Math.max(...values))
  const span = scale.max - scale.min || 1
  const scaleX = scaleXFor(width)
  const scaleY = (y: number) => MARGIN.top + PLOT_HEIGHT - ((y - scale.min) / span) * PLOT_HEIGHT
  const baselineY = scaleY(scale.min)
  const ticks = [scale.max, (scale.min + scale.max) / 2, scale.min]

  // The readout carries more resolution than the axis: the axis states levels, the cursor
  // states the measurement the reader hovered for. Mirrors `ChartStackPainter.Decimals`.
  const decimals = chartReadoutDecimals(scale.max - scale.min)
  const showNames = panel.series.length > 1
  const cursorX = cursorPosition !== null ? scaleX(cursorPosition) : null
  const readoutRows = (readout?.series ?? []).map((series) => ({ ...series, y: series.value !== null ? scaleY(series.value) : null }))
  const presentRow = readoutRows.find((row) => row.y !== null)
  const anchorY = presentRow?.y ?? MARGIN.top + PLOT_HEIGHT / 2
  // Beside the crosshair, flipping to its other side rather than running off the plot.
  const chipOnLeft = cursorPosition !== null && cursorPosition >= 0.5

  return (
    <div className="analysis-chart-plot">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="analysis-chart-svg" role="img" aria-label={`${panel.title} trace`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={scaleY(tick)} y2={scaleY(tick)} className="analysis-chart-grid" />
            <text x={MARGIN.left - 6} y={scaleY(tick)} className="analysis-chart-axis-label tabular" textAnchor="end" dominantBaseline="middle">
              {formatScaleValue(tick, scale.step)}
            </text>
          </g>
        ))}
        {panel.series.map((series) =>
          series.fillArea ? (
            <path
              key={`${series.name}-fill`}
              d={buildAreaPath(series, scaleX, scaleY, baselineY)}
              fill={seriesColor(series.role)}
              fillOpacity={0.16}
              stroke="none"
            />
          ) : null,
        )}
        {panel.series.map((series) => (
          <path key={series.name} d={buildLinePath(series, scaleX, scaleY)} fill="none" stroke={seriesColor(series.role)} strokeWidth={1.5} />
        ))}
        {cursorX !== null && (
          <>
            <line x1={cursorX} x2={cursorX} y1={MARGIN.top} y2={MARGIN.top + PLOT_HEIGHT} className="analysis-chart-cursor-line" />
            {readoutRows.map((row) =>
              row.y !== null ? (
                <g key={row.name}>
                  <circle cx={cursorX} cy={row.y} r={5} className="analysis-chart-marker-ring" />
                  <circle cx={cursorX} cy={row.y} r={4} fill={seriesColor(row.role)} />
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
            top: `${(anchorY / HEIGHT) * 100}%`,
            transform: chipOnLeft ? 'translate(calc(-100% - 8px), -50%)' : 'translate(8px, -50%)',
          }}
        >
          {readoutRows.map((row) => (
            <div key={row.name} className="analysis-chart-readout-row">
              <span className="analysis-chart-readout-key" style={{ background: seriesColor(row.role) }} />
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

/** The shared X axis, drawn once under the whole stack, in the same coordinate space every panel's crosshair uses. */
function AxisRow({ width, cursorPosition }: { width: number; cursorPosition: number | null }) {
  const scaleX = scaleXFor(width)
  const cursorX = cursorPosition !== null ? scaleX(cursorPosition) : null
  const cursorText = cursorPosition !== null ? formatTrackPositionCursor(cursorPosition) : ''
  const chipWidth = cursorText.length * 7.5 + 14
  const chipLeft = cursorX !== null ? Math.min(Math.max(cursorX - chipWidth / 2, MARGIN.left), width - MARGIN.right - chipWidth) : 0

  return (
    <svg viewBox={`0 0 ${width} ${AXIS_HEIGHT}`} className="analysis-chart-axis-svg" role="presentation" aria-hidden="true">
      {AXIS_TICKS.map((fraction) => (
        <text
          key={fraction}
          x={scaleX(fraction)}
          y={AXIS_HEIGHT / 2}
          className="analysis-chart-axis-label tabular"
          textAnchor={fraction <= 0 ? 'start' : fraction >= 1 ? 'end' : 'middle'}
          dominantBaseline="middle"
        >
          {formatTrackPosition(fraction)}
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

/** The stack: same X domain (track position) down every panel, one shared cursor, one axis row at the bottom. */
export function LapTraceChartStack({ panels }: { panels: readonly ChartPanel[] }) {
  const [cursor, setCursor] = useState<ChartCursorState>(CHART_CURSOR_NONE)
  const width = useMeasuredWidth()
  const cursorPosition = cursor.kind === 'at' ? cursor.position : null
  const readout = cursorPosition !== null ? chartStackReadoutAt(panels, cursorPosition) : null

  const positionFromPointer = (event: ReactPointerEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return 0
    const x = ((event.clientX - rect.left) / rect.width) * width.value
    return Math.min(1, Math.max(0, (x - MARGIN.left) / plotWidth(width.value)))
  }

  return (
    <div
      ref={width.ref}
      className="analysis-chart-stack"
      tabIndex={0}
      role="group"
      aria-label="Lap comparison chart. Hover, or use the arrow keys while focused, to read values at a track position."
      onPointerMove={(event) => setCursor({ kind: 'at', position: positionFromPointer(event) })}
      onPointerLeave={() => setCursor(CHART_CURSOR_NONE)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        setCursor((current) => moveChartCursorByKey(current, event.key === 'ArrowLeft' ? -1 : 1))
      }}
    >
      {panels.map((panel, index) => (
        <LapTraceChartPanel key={panel.title} panel={panel} width={width.value} cursorPosition={cursorPosition} readout={readout?.panels[index] ?? null} />
      ))}
      <AxisRow width={width.value} cursorPosition={cursorPosition} />
    </div>
  )
}

/** The stack's own content width in CSS pixels, updated on resize only. */
function useMeasuredWidth(): { ref: (element: HTMLDivElement | null) => void; value: number } {
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

  return { ref: setElement, value }
}
