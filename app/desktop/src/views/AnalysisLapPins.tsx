import { useEffect, useRef, useState } from 'react'
import { MessageSquare, SlidersHorizontal, X } from 'lucide-react'
import { CHART_MARGIN, PinLines, plotWidth, scaleXFor } from './AnalysisChart'
import type { ChartLine } from './AnalysisChart'
import { LAP_NOTE_MAX_LENGTH } from './AnalysisDomain'
import type { LapNote } from './AnalysisDomain'
import { SETTINGS_LANE } from './AnalysisLapCharts'
import { formatSettingValue, pinWidth, placePins, settingPinText } from './AnalysisLapMarks'
import type { CarSettingsChart, LapPin, SettingRun } from './AnalysisLapMarks'
import { acrossWindow, inWindow } from './AnalysisPlot'
import type { LapWindow } from './AnalysisPlot'
import { FriendBadge } from './OnTrackPages'

/**
 * What the lap page draws over and among its charts from `AnalysisLapMarks.ts`: a row of pins per
 * lap (setting changes and notes), the Car settings lanes, and a note's bubble and editor. Dumb:
 * positions and texts come in, clicks go out.
 */

/** One lap's pins. `other`: the lap compared with, drawn dashed like its lines. */
export type PinRow = { key: string; label: string | null; other: boolean; pins: LapPin[] }

const ROW_HEIGHT = 26

/** How tall the pin rows draw. */
export const pinRowsHeight = (rows: readonly PinRow[]): number => rows.length * ROW_HEIGHT

/** A pin's key, stable while the lap's notes and settings do not change. */
export const pinKey = (pin: LapPin): string => (pin.kind === 'note' ? `note-${pin.note.id}` : `setting-${pin.position}`)

// Lines of one lap closer than this (a fraction of the lap, ~1 px) draw as one.
const SAME_LINE = 0.003

/** Every pin's line down the charts; a lap's pins at one spot (a note at a change) share one. */
export const pinLines = (rows: readonly PinRow[]): ChartLine[] =>
  rows.flatMap((row) =>
    row.pins
      .filter((pin, index) => index === 0 || pin.position - row.pins[index - 1].position > SAME_LINE)
      .map((pin) => ({ key: `${row.key}-${pinKey(pin)}`, position: pin.position, other: row.other })),
  )

/**
 * The pins over the charts, one row per lap, each pin over its place and nudged aside when two
 * would overlap. A setting pin says what it changed to; a note pin opens the note. Only the pins
 * in the charts' `view` are drawn.
 */
export function PinRows({
  rows,
  width,
  view,
  openNoteId,
  placeOf,
  onNote,
}: {
  rows: readonly PinRow[]
  width: number
  view: LapWindow
  openNoteId: string | null
  /** Where a pin is, in words ("3.2 km · C3"), for its tooltip. */
  placeOf: (position: number) => string
  onNote: (note: LapNote, row: PinRow, position: number) => void
}) {
  const plot = plotWidth(width)
  return (
    <>
      {rows.map((row) => {
        const pins = row.pins.filter((pin) => inWindow(view, pin.position))
        const lefts = placePins(
          pins.map((pin) => ({ position: acrossWindow(view, pin.position), width: pinWidth(pin) })),
          plot,
        )
        return (
          <div key={row.key} className="analysis-pin-row" style={{ height: ROW_HEIGHT }}>
            {row.label && (
              <span className="analysis-pin-row-label" title={row.label} style={{ width: CHART_MARGIN.left - 6 }}>
                {row.label}
              </span>
            )}
            {pins.map((pin, index) => {
              const left = CHART_MARGIN.left + lefts[index]
              const dashed = row.other ? ' other' : ''
              if (pin.kind === 'setting') {
                const changes = pin.changes.map((change) => `${change.setting.name} ${formatSettingValue(change.setting.channel, change.from)} → ${formatSettingValue(change.setting.channel, change.to)}`)
                return (
                  <span key={pinKey(pin)} className={`analysis-pin setting${dashed}`} style={{ left, width: pinWidth(pin) }} title={`${changes.join(', ')} at ${placeOf(pin.position)}`}>
                    <SlidersHorizontal size={12} aria-hidden="true" />
                    <span className="analysis-pin-text tabular">{settingPinText(pin.changes)}</span>
                  </span>
                )
              }
              const open = openNoteId === pin.note.id
              return (
                <button
                  key={pinKey(pin)}
                  type="button"
                  className={`analysis-pin note${dashed}${open ? ' open' : ''}`}
                  style={{ left, width: pinWidth(pin) }}
                  aria-pressed={open}
                  aria-label={`Note${pin.note.author ? ` by ${pin.note.author}` : ''} at ${placeOf(pin.position)}`}
                  onClick={() => onNote(pin.note, row, pin.position)}
                >
                  <MessageSquare size={12} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        )
      })}
    </>
  )
}

/**
 * The Car settings chart's lanes: each setting's name over its value as steps along the lap, the
 * value written at the start of each step — yours solid, the compared lap's dashed beneath.
 */
export function CarSettingsLanes({
  chart,
  width,
  height,
  view,
  cursorPosition,
  lines,
  compared,
}: {
  chart: CarSettingsChart
  width: number
  height: number
  /** The stretch of the lap the charts show: a step reaching past it is cut at the plot's edge. */
  view: LapWindow
  cursorPosition: number | null
  lines: readonly ChartLine[]
  compared: boolean
}) {
  if (chart.lanes.length === 0) return null
  const scaleX = scaleXFor(width, view)
  const plotLeft = CHART_MARGIN.left
  const plotRight = width - CHART_MARGIN.right
  const laneHeight = SETTINGS_LANE.label + SETTINGS_LANE.bar + (compared ? SETTINGS_LANE.between + SETTINGS_LANE.bar : 0) + SETTINGS_LANE.after
  const cursorX = cursorPosition !== null ? scaleX(cursorPosition) : null

  const bar = (runs: SettingRun[] | null, channel: string, y: number, other: boolean) =>
    (runs ?? []).map((run, index) => {
      if (run.to < view.from || run.from > view.to) return null
      // A hairline between steps, so a change reads even where the two values look alike.
      const x = Math.max(plotLeft, scaleX(run.from) + (index > 0 ? 1 : 0))
      const runWidth = Math.max(1, Math.min(plotRight, scaleX(run.to) - (index < (runs ?? []).length - 1 ? 1 : 0)) - x)
      return (
        <g key={`${run.from}`}>
          <rect x={x} y={y} width={runWidth} height={SETTINGS_LANE.bar} rx={3} className={other ? 'analysis-lane-run other' : 'analysis-lane-run'} />
          {runWidth >= 26 && (
            <text x={x + 6} y={y + SETTINGS_LANE.bar / 2} dominantBaseline="central" className={other ? 'analysis-lane-value other tabular' : 'analysis-lane-value tabular'}>
              {formatSettingValue(channel, run.value)}
            </text>
          )}
        </g>
      )
    })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="analysis-chart-svg" style={{ height }} role="img" aria-label="Car settings along the lap">
      <PinLines lines={lines.filter((line) => inWindow(view, line.position))} scaleX={scaleX} top={0} bottom={height - SETTINGS_LANE.after} />
      {chart.lanes.map((lane, index) => {
        const top = index * laneHeight
        const mineY = top + SETTINGS_LANE.label
        return (
          <g key={lane.setting.channel}>
            <text x={CHART_MARGIN.left} y={top + SETTINGS_LANE.label / 2} dominantBaseline="central" className="analysis-lane-label">
              {lane.setting.name}
            </text>
            {bar(lane.mine, lane.setting.channel, mineY, false)}
            {compared && bar(lane.other, lane.setting.channel, mineY + SETTINGS_LANE.bar + SETTINGS_LANE.between, true)}
          </g>
        )
      })}
      {cursorX !== null && <line x1={cursorX} x2={cursorX} y1={0} y2={height - SETTINGS_LANE.after} className="analysis-chart-cursor-line" />}
    </svg>
  )
}

const POPOVER_WIDTH = 300

/** Where a popover over the charts starts: by its place on the lap in the charts' `view`, kept inside the plot. */
export function popoverLeft(position: number, width: number, view: LapWindow): number {
  const x = scaleXFor(width, view)(position)
  return Math.max(CHART_MARGIN.left, Math.min(x - 24, width - CHART_MARGIN.right - POPOVER_WIDTH))
}

/**
 * A note, open from its pin: who left it, where, and what it says. The driver's own can be
 * edited or deleted (after a confirm); one that came with a shared lap only read.
 */
export function NoteBubble({
  note,
  place,
  lapName,
  onEdit,
  onDelete,
  onClose,
}: {
  note: LapNote
  place: string
  /** The lap it is on, when that is not the open lap (the lap compared with). */
  lapName: string | null
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)
  // Focus comes along, so Esc closes it and the keyboard reaches Edit and Delete.
  useEffect(() => box.current?.focus(), [note.id])
  const author = note.author || (note.mine ? 'You' : 'Unknown driver')

  return (
    <div ref={box} tabIndex={-1} className="analysis-note-popover" role="dialog" aria-label={`Note by ${author}`} style={{ width: POPOVER_WIDTH }} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <div className="analysis-note-head">
        <span className="analysis-note-author">
          {!note.mine && <FriendBadge name={author} />}
          <strong>{author}</strong>
        </span>
        {/* The lap is named when it is not the open one, unless the author already names it. */}
        <span className="analysis-secondary tabular">{lapName && lapName !== author ? `${lapName} · ${place}` : place}</span>
        <button type="button" className="icon-button analysis-note-close" aria-label="Close note" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <p className="analysis-note-text">{note.text}</p>
      {note.mine &&
        (confirming ? (
          <div className="analysis-note-actions">
            <span className="analysis-secondary">Delete this note?</span>
            <button type="button" className="button subtle" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="button destructive" onClick={onDelete}>
              Delete
            </button>
          </div>
        ) : (
          <div className="analysis-note-actions">
            <button type="button" className="button subtle" onClick={onEdit}>
              Edit
            </button>
            <button type="button" className="button subtle" onClick={() => setConfirming(true)}>
              Delete
            </button>
          </div>
        ))}
    </div>
  )
}

/**
 * Writing a note at a place on the lap, or rewriting one: the text, then Save or Cancel. Saving
 * waits for the host, so a refused note keeps its text.
 */
export function NoteEditor({
  title,
  place,
  initial,
  onSave,
  onCancel,
}: {
  title: string
  place: string
  initial: string
  onSave: (text: string) => Promise<boolean>
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (text.trim().length === 0 || saving) return
    setSaving(true)
    const saved = await onSave(text.trim())
    if (!saved) setSaving(false)
  }

  return (
    <div
      className="analysis-note-popover"
      role="dialog"
      aria-label={title}
      style={{ width: POPOVER_WIDTH }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel()
        else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void save()
      }}
    >
      <div className="analysis-note-head">
        <strong>{title}</strong>
        <span className="analysis-secondary tabular">{place}</span>
      </div>
      <textarea
        className="analysis-note-input"
        value={text}
        rows={3}
        maxLength={LAP_NOTE_MAX_LENGTH}
        autoFocus
        aria-label="Note"
        placeholder="What happened here?"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="analysis-note-actions">
        <span className="analysis-note-hint">Goes with the lap when you share it</span>
        <button type="button" className="button subtle" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button primary" disabled={text.trim().length === 0 || saving} onClick={() => void save()}>
          Save
        </button>
      </div>
    </div>
  )
}
