'use client'

// Hand-built SVG charts after DESIGN.md → Web app → Charts: one series in brand-500,
// context in chart-muted / chart-muted-strong, 2px lines, bars ≤ 24px with radius-xs
// tops on a separator baseline, 3–5 solid grid lines, dashed lines only for a
// target reference, labelled at its end. Labels are selective (the maximum, the
// reference); everything else is in a solid tooltip that follows the pointer and
// the keyboard (focus the chart, then ←/→, Home/End, Esc). Each chart is a <figure>
// with a visually hidden caption and table for screen readers.
//
// ChartFrame and the helpers below are the building blocks for new charts; dense
// series (telemetry traces) use the Recharts wrapper in components/ui/chart.tsx.
// Charts are pure: data and pre-formatted labels via props. Widths follow the
// container; heights are fixed per chart so nothing jumps while measuring.

import { useEffect, useId, useState, type ReactNode } from 'react'
import { niceTicks, type TickScale } from '@/lib/ticks'

/** Formats a value for display, e.g. 12 → "12 sessions". */
export type FormatValue = (value: number) => string

/** One line of a tooltip: the label, then its value. */
export type ChartReadoutRow = { label: string; value: string }
export type ChartReadout = { title: string; rows: readonly ChartReadoutRow[]; note?: string }

export const tickText = 'fill-label-secondary text-caption font-normal tabular-nums'
export const valueText = 'fill-label text-caption'

/** Rough width of a label in the caption style; good enough to keep labels clear of edges. */
export function textWidth(text: string) {
  return text.length * 6.4
}

/** Maps a value to a y coordinate on the ticks' domain, top tick at `top`, bottom tick at `top + height`. */
export function yScale(ticks: readonly number[], top: number, height: number) {
  const low = ticks[0] ?? 0
  const high = ticks[ticks.length - 1] ?? 1
  const span = high > low ? high - low : 1
  return (value: number) => top + height - ((value - low) / span) * height
}

/** Left margin that fits the widest y tick label. */
export function axisMargin(ticks: readonly number[], format: FormatValue) {
  return Math.max(32, ...ticks.map((tick) => textWidth(format(tick)) + 12))
}

/** A column with radius-xs top corners, square at the baseline. */
export function columnPath(x: number, width: number, top: number, base: number, radius = 4) {
  const r = Math.min(radius, width / 2, Math.max(0, base - top))
  if (r <= 0) return `M${x},${base}V${top}H${x + width}V${base}Z`
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`
}

/** The measured width of the element given to `ref`. */
export function useWidth() {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!node) return
    const observer = new ResizeObserver(() => setWidth(Math.round(node.clientWidth)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return { ref: setNode, width }
}

/** Y gridlines with their tick labels on the left. */
export function YGrid({
  ticks,
  y,
  left,
  right,
  format,
}: {
  ticks: readonly number[]
  y: (value: number) => number
  left: number
  right: number
  format: FormatValue
}) {
  return (
    <g>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="stroke-separator" />
          <text x={left - 8} y={y(tick) + 4} textAnchor="end" className={tickText}>
            {format(tick)}
          </text>
        </g>
      ))}
    </g>
  )
}

type Plot = { left: number; right: number }

/**
 * The frame every interactive chart shares: measures the width, maps pointer and
 * keyboard to one of `count` equal slots between `plot.left` and `plot.right`,
 * shows the slot's readout as a solid tooltip beside it and renders the sr-only table.
 */
export function ChartFrame({
  title,
  height,
  count,
  plot,
  initial,
  readout,
  table,
  children,
}: {
  title: string
  height: number
  count: number
  plot: (width: number) => Plot
  /** The slot the keyboard starts on, e.g. the latest. */
  initial: number
  readout: (index: number) => ChartReadout
  table: ReactNode
  children: (width: number, active: number | null) => ReactNode
}) {
  const { ref, width } = useWidth()
  const [active, setActive] = useState<number | null>(null)
  const tooltipId = useId()
  const { left, right } = plot(width)
  const slot = count > 0 ? (right - left) / count : 0
  const shown = active === null || active >= count ? null : active
  const center = shown === null ? 0 : left + (shown + 0.5) * slot
  const info = shown === null ? null : readout(shown)

  function move(next: number) {
    setActive(Math.max(0, Math.min(count - 1, next)))
  }

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{title}</figcaption>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={title}
        aria-describedby={info ? tooltipId : undefined}
        className="relative rounded-md"
        style={{ height }}
        onPointerMove={(event) => {
          const x = event.clientX - event.currentTarget.getBoundingClientRect().left
          setActive(x < left || x > right || slot <= 0 ? null : Math.min(count - 1, Math.floor((x - left) / slot)))
        }}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(initial)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          const current = shown ?? initial
          if (event.key === 'ArrowRight') move(current + 1)
          else if (event.key === 'ArrowLeft') move(current - 1)
          else if (event.key === 'Home') move(0)
          else if (event.key === 'End') move(count - 1)
          else if (event.key === 'Escape') setActive(null)
          else return
          event.preventDefault()
        }}
      >
        {width > 0 ? (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden focusable="false" className="block overflow-visible">
            {children(width, shown)}
          </svg>
        ) : null}
        {info ? (
          <div
            id={tooltipId}
            role="tooltip"
            className="floating pointer-events-none absolute top-1 z-10 max-w-64 min-w-32 rounded-md px-2.5 py-1.5 text-footnote shadow-(--shadow-e3)"
            // Beside the active slot, on the side with more room, so it never covers the mark.
            style={center < width / 2 ? { left: center + slot / 2 + 8 } : { right: width - center + slot / 2 + 8 }}
          >
            <div className="font-semibold text-label">{info.title}</div>
            {info.rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4">
                <span className="text-label-secondary">{row.label}</span>
                <span className="font-semibold text-label tabular-nums">{row.value}</span>
              </div>
            ))}
            {info.note ? <div className="text-label-secondary">{info.note}</div> : null}
          </div>
        ) : null}
      </div>
      {table}
    </figure>
  )
}

/** The screen-reader equivalent: one row per slot, the first cell its row header. */
export function SrTable({
  title,
  columns,
  rows,
}: {
  title: string
  columns: readonly string[]
  rows: readonly { key: string; head: string; cells: readonly string[] }[]
}) {
  return (
    <table className="sr-only">
      <caption>{title}</caption>
      <thead>
        <tr>
          <td />
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row">{row.head}</th>
            {row.cells.map((cell, index) => (
              <td key={columns[index]}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** One column of a ColumnChart. `highlight` marks the one column the chart is about. */
export type ChartColumn = { label: string; value: number; highlight?: boolean }

/**
 * One column per slot (weeks, laps, stints): context columns in chart-muted, the
 * highlighted one in brand-500. The highest column carries its value; everything
 * else is in the tooltip and the screen-reader table.
 */
export function ColumnChart({
  title,
  columns,
  valueLabel,
  formatValue = String,
  formatTick = formatValue,
  tickScale = 'decimal',
  height = 180,
}: {
  title: string
  columns: readonly ChartColumn[]
  /** Names the value in the tooltip and table, e.g. "Sessions". */
  valueLabel: string
  formatValue?: FormatValue
  formatTick?: FormatValue
  /** 'duration' for values in seconds, so gridlines land on clock steps. */
  tickScale?: TickScale
  height?: number
}) {
  const values = columns.map((column) => column.value)
  const max = Math.max(0, ...values)
  const maxIndex = max > 0 ? values.indexOf(max) : -1
  const ticks = niceTicks(values, 3, 1, tickScale)
  const margin = { left: axisMargin(ticks, formatTick), right: 8, top: 22, bottom: 24 }
  const plot = (width: number) => ({ left: margin.left, right: width - margin.right })
  const highlighted = columns.findIndex((column) => column.highlight)

  return (
    <ChartFrame
      title={title}
      height={height}
      count={columns.length}
      plot={plot}
      initial={highlighted >= 0 ? highlighted : columns.length - 1}
      readout={(index) => ({ title: columns[index]?.label ?? '', rows: [{ label: valueLabel, value: formatValue(columns[index]?.value ?? 0) }] })}
      table={
        <SrTable
          title={title}
          columns={[valueLabel]}
          rows={columns.map((column) => ({ key: column.label, head: column.label, cells: [formatValue(column.value)] }))}
        />
      }
    >
      {(width, active) => {
        const { left, right } = plot(width)
        const plotHeight = height - margin.top - margin.bottom
        const slot = (right - left) / Math.max(1, columns.length)
        const barWidth = Math.min(24, Math.max(2, slot * 0.5))
        const y = yScale(ticks, margin.top, plotHeight)
        const base = y(0)
        const centerOf = (index: number) => left + (index + 0.5) * slot
        return (
          <>
            <YGrid ticks={ticks} y={y} left={left} right={right} format={formatTick} />
            {active !== null ? (
              <rect x={left + active * slot + slot * 0.1} y={margin.top} width={slot * 0.8} height={plotHeight} rx={4} className="fill-fill" />
            ) : null}
            {columns.map((column, index) =>
              column.value !== 0 ? (
                <path
                  key={column.label}
                  d={columnPath(centerOf(index) - barWidth / 2, barWidth, y(column.value), base, Math.min(4, barWidth / 2))}
                  className={column.highlight ? 'fill-brand-500' : 'fill-chart-muted'}
                />
              ) : null,
            )}
            <line x1={left} x2={right} y1={base} y2={base} className="stroke-separator" />
            {maxIndex >= 0 ? (
              <text x={centerOf(maxIndex)} y={y(max) - 6} textAnchor="middle" className={valueText}>
                {formatValue(max)}
              </text>
            ) : null}
            {columns.map((column, index) => (
              <text key={column.label} x={centerOf(index)} y={height - 6} textAnchor="middle" className={tickText}>
                {column.label}
              </text>
            ))}
          </>
        )
      }}
    </ChartFrame>
  )
}
