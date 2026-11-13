import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Play, SlidersHorizontal } from 'lucide-react'
import { DashCanvas, alertColorSwatch, dashSettingColors, gridRect, maxAlertSeconds, previewAlertBanner, resolveDashPalette, resolvePreviewFrame } from '@sprint/dashboard'
import type { DashLayout, DashPage, DashPaletteColors } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import {
  ALERT_COLOR_TOKENS,
  ALERT_TYPES,
  alertLook,
  alertToPlay,
  findAlert,
  globalAlertConfig,
  previewMoveRect,
  previewResizeRect,
  setAlertEnabled,
  setAlertGeometry,
  setAlertOverride,
  setAlertUseGlobal,
  setGlobalAlertConfig,
  type AlertDisplayMode,
  type AlertLook,
  type AlertOverride,
  type AlertTypeId,
  type GridRect,
} from '../views/DashesDomain'
import { DurationBox } from './controls'
import { relativePointerPos, type PointerPos } from './DesignerCanvas'
import { BEZEL, useStageCanvas } from './useStageCanvas'
import type { Mutate } from './useDesignerDoc'
import { Switch } from '../shell/Switch'
import './AlertsSection.css'

type Apply = (mutate: Mutate, group?: string) => boolean

/** The row picked on the left: the defaults every alert shares, or one alert type. */
type AlertRow = { kind: 'all' } | { kind: 'alert'; type: AlertTypeId }

const ALERT_DESCRIPTIONS: Record<AlertTypeId, string> = {
  tc_change: 'When TC changes while driving',
  abs_change: 'When ABS changes while driving',
  bias_change: 'When brake bias changes while driving',
  enginemap_change: 'When the engine map changes while driving',
  lap_summary: 'After each timed lap: the lap and your position, the lap time against the plan and your best, the fuel against the plan',
}

/**
 * Alerts: the alert types on the left with their on/off switches under an "All alerts" row that
 * holds the look every alert shares; the picked row's look on the right; the dash in the middle
 * plays the picked alert with sample values whenever its look changes, and again on "Play again".
 * An alert shown "In a box" gets its box on the dash, to drag and size like a widget.
 */
export function AlertsSection({ layout, apply, frame, page, idle }: { layout: DashLayout; apply: Apply; frame: TelemetryFrame | null; page: DashPage | null; idle: boolean }) {
  const [row, setRow] = useState<AlertRow>({ kind: 'alert', type: ALERT_TYPES[0]?.type ?? 'tc_change' })
  const [replays, setReplays] = useState(0)
  const [playing, setPlaying] = useState(false)
  const { setFitElement, canvas } = useStageCanvas(layout)
  const palette = resolveDashPalette(layout.theme, layout.colorSystem)

  const type = row.kind === 'alert' ? row.type : null
  const enabled = type === null || (findAlert(layout, type)?.enabled ?? false)
  const look: AlertLook = type === null ? { ...globalAlertConfig(layout), own: false } : alertLook(layout, type)
  const played = alertToPlay(layout, type)
  const boxed = type !== null && type !== 'lap_summary' && enabled && look.displayMode === 'center' ? played : null

  // Plays the picked alert for its duration: on picking it, on every change to its look, and on
  // Play again. Finite: the dash goes back to the page once the time is up.
  const playKey = `${replays}|${type ?? 'all'}|${enabled}|${JSON.stringify(look)}`
  useEffect(() => {
    if (!enabled) {
      setPlaying(false)
      return
    }
    setPlaying(true)
    const timeout = window.setTimeout(() => setPlaying(false), look.durationSeconds * 1000)
    return () => window.clearTimeout(timeout)
  }, [playKey, enabled, look.durationSeconds])

  const banner = playing ? previewAlertBanner(layout, played, palette) : null

  return (
    <>
      <aside className="designer-glass designer-sidebar" aria-label="Alerts">
        <div className="designer-sidebar-head">
          <h2 className="designer-panel-title">Alerts</h2>
        </div>
        <div className="designer-sidebar-body alerts-list">
          <button type="button" className={row.kind === 'all' ? 'alerts-all selected' : 'alerts-all'} aria-pressed={row.kind === 'all'} onClick={() => setRow({ kind: 'all' })}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span className="designer-row-label">All alerts</span>
            <span className="muted">defaults</span>
          </button>
          <ul className="alerts-rows" aria-label="Alert types">
            {ALERT_TYPES.map(({ type: candidate, label }) => {
              const selected = row.kind === 'alert' && row.type === candidate
              const on = findAlert(layout, candidate)?.enabled ?? false
              const ownLook = candidate !== 'lap_summary' && alertLook(layout, candidate).own
              return (
                <li key={candidate} className={selected ? 'alerts-row selected' : 'alerts-row'}>
                  <button type="button" className="alerts-row-main" aria-pressed={selected} onClick={() => setRow({ kind: 'alert', type: candidate })}>
                    <span className="designer-row-label">{label}</span>
                    {ownLook && <span className="alerts-row-note">own look</span>}
                  </button>
                  <Switch
                    checked={on}
                    stateText={false}
                    aria-label={`Show ${label}`}
                    onChange={(next) => {
                      apply((current) => setAlertEnabled(current, candidate, next))
                      setRow({ kind: 'alert', type: candidate })
                    }}
                  />
                </li>
              )
            })}
          </ul>
        </div>
        <p className="field-hint designer-sidebar-foot">The switch turns an alert off for this dash only.</p>
      </aside>

      <div ref={setFitElement} className="designer-fit">
        {canvas && (
          <div className="designer-bezel" style={{ padding: BEZEL }}>
            <div className="alerts-canvas" style={{ width: canvas.width, height: canvas.height }}>
              <DashCanvas layout={layout} frame={resolvePreviewFrame('live', frame)} width={canvas.width} height={canvas.height} pageId={page?.id} idle={idle} alertBanner={banner} />
              {boxed && type !== null && (
                <AlertBox
                  layout={layout}
                  alert={boxed}
                  width={canvas.width}
                  height={canvas.height}
                  onChange={(rect, group) => apply((current) => setAlertGeometry(current, type, rect), group)}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <aside className="designer-glass designer-inspector" aria-label={type === null ? 'All alerts' : 'Alert'}>
        {type === null ? (
          <>
            <PanelHead title="All alerts" description="The look every alert shares, unless it has its own" />
            <LookFields look={look} palette={palette} onChange={(patch, group) => apply((current) => setGlobalAlertConfig(current, patch), group)} />
            {look.displayMode === 'center' && <p className="field-hint">Each alert has its own box on the dash: pick it on the left to place it.</p>}
          </>
        ) : (
          <AlertCard key={type} type={type} enabled={enabled} look={look} palette={palette} apply={apply} />
        )}
      </aside>

      <div className="designer-glass designer-dock">
        <button type="button" className="button subtle" disabled={!enabled} onClick={() => setReplays((count) => count + 1)}>
          <Play /> Play again
        </button>
        <span className="designer-dock-sep" aria-hidden="true" />
        <span className="muted alerts-dock-note">{page ? `Previewing on the ${page.name} page` : 'This dash has no pages yet'}</span>
      </div>
    </>
  )
}

function PanelHead({ title, description }: { title: string; description: string }) {
  return (
    <div className="designer-panel-intro">
      <h2 className="designer-panel-title">{title}</h2>
      <p className="field-hint">{description}</p>
    </div>
  )
}

/** One alert's card: on or off, Same as all or its own look (the lap summary only has a duration). */
function AlertCard({ type, enabled, look, palette, apply }: { type: AlertTypeId; enabled: boolean; look: AlertLook; palette: DashPaletteColors; apply: Apply }) {
  const label = ALERT_TYPES.find((candidate) => candidate.type === type)?.label ?? type
  const head = <PanelHead title={label} description={ALERT_DESCRIPTIONS[type]} />
  const override = (patch: AlertOverride, group?: string): void => {
    apply((current) => setAlertOverride(current, type, patch), group)
  }

  if (!enabled) {
    return (
      <>
        {head}
        <p className="field-hint">Off on this dash. Turn it on with its switch to set how it looks.</p>
      </>
    )
  }

  if (type === 'lap_summary') {
    return (
      <>
        {head}
        <p className="field-hint">Fills the screen in the dash's own colours; the gear stays in sight.</p>
        <div className="alerts-field-row">
          <span>Duration</span>
          <DurationBox
            seconds={look.durationSeconds}
            max={maxAlertSeconds(type)}
            step={0.5}
            onChange={(durationSeconds) => override({ durationSeconds }, `alert:${type}:duration`)}
          />
        </div>
      </>
    )
  }

  return (
    <>
      {head}
      <div className="alerts-field">
        <span className="alerts-field-label">Look</span>
        <Segmented
          label="Look"
          value={look.own ? 'own' : 'all'}
          options={[
            { value: 'all', label: 'Same as all' },
            { value: 'own', label: 'Its own' },
          ]}
          onChange={(value) => apply((current) => setAlertUseGlobal(current, type, value === 'all'))}
        />
      </div>
      {look.own ? (
        <LookFields look={look} palette={palette} onChange={(patch, group) => override(patch, group ? `alert:${type}:${group}` : undefined)} />
      ) : (
        <p className="field-hint">Shows the way All alerts sets it.</p>
      )}
      {look.displayMode === 'center' && <p className="field-hint">Drag its box on the dash to place it; drag the corner to size it.</p>}
    </>
  )
}

/** Where, colour, duration and inversion: the defaults for All alerts, or one alert's own look. */
function LookFields({ look, palette, onChange }: { look: AlertLook; palette: DashPaletteColors; onChange: (patch: AlertOverride, group?: string) => void }) {
  return (
    <>
      <div className="alerts-field">
        <span className="alerts-field-label">Where</span>
        <Segmented<AlertDisplayMode>
          label="Where"
          value={look.displayMode}
          options={[
            { value: 'full', label: 'Full screen' },
            { value: 'center', label: 'In a box' },
          ]}
          onChange={(displayMode) => onChange({ displayMode })}
        />
      </div>
      <div className="alerts-field">
        <span className="alerts-field-label">Colour</span>
        <AlertColours value={look.colorToken} palette={palette} onChange={(colorToken) => onChange({ colorToken })} />
      </div>
      <div className="alerts-field-row">
        <span>Duration</span>
        <DurationBox seconds={look.durationSeconds} onChange={(durationSeconds) => onChange({ durationSeconds }, 'duration')} />
      </div>
      <div className="alerts-field-row">
        <span>Invert colours</span>
        <Switch checked={look.invertColors} stateText={false} aria-label="Invert colours" onChange={(next) => onChange({ invertColors: next })} />
      </div>
    </>
  )
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" className="segmented-item" aria-checked={option.value === value} onClick={() => option.value !== value && onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

// "Automatic" is each setting's own colour, so its swatch shows them all.
const AUTOMATIC_SWATCH = `conic-gradient(${dashSettingColors.tc} 0 25%, ${dashSettingColors.abs} 0 50%, ${dashSettingColors.engineMap} 0 75%, ${dashSettingColors.brakeBias} 0)`

/** The alert colours as swatches, in the dash's own colours. A radio group: arrow keys move the choice. */
function AlertColours({ value, palette, onChange }: { value: string; palette: DashPaletteColors; onChange: (token: string) => void }) {
  const current = ALERT_COLOR_TOKENS.findIndex((token) => token.value === value)
  const selectedIndex = current < 0 ? 0 : current

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const index = (selectedIndex + step + ALERT_COLOR_TOKENS.length) % ALERT_COLOR_TOKENS.length
    onChange(ALERT_COLOR_TOKENS[index].value)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[index]?.focus()
  }

  return (
    <div className="designer-swatches alerts-swatches" role="radiogroup" aria-label="Colour" onKeyDown={onKeyDown}>
      {ALERT_COLOR_TOKENS.map((token, index) => {
        const checked = index === selectedIndex
        return (
          <button
            key={token.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={token.label}
            title={token.label}
            tabIndex={checked ? 0 : -1}
            className="designer-swatch"
            style={{ background: alertColorSwatch(token.value, palette) ?? AUTOMATIC_SWATCH }}
            onClick={() => onChange(token.value)}
          />
        )
      })}
    </div>
  )
}

type BoxDrag = { mode: 'move' | 'resize'; start: GridRect; pointerStart: PointerPos; pointer: PointerPos }

/**
 * The alert's box on the dash: drag it to move, its corner to resize; arrow keys move it and
 * Shift+arrow keys resize. A drag is committed once, on release, so it is one undo step.
 */
function AlertBox({ layout, alert, width, height, onChange }: { layout: DashLayout; alert: GridRect; width: number; height: number; onChange: (rect: GridRect, group?: string) => void }) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<BoxDrag | null>(null)
  const cols = layout.gridCols > 0 ? layout.gridCols : 20
  const rows = layout.gridRows > 0 ? layout.gridRows : 12
  const surface = (): HTMLElement | null => boxRef.current?.parentElement ?? null

  const dragRect = (state: BoxDrag): GridRect => {
    const deltaCol = Math.round((state.pointer.x - state.pointerStart.x) / (width / cols))
    const deltaRow = Math.round((state.pointer.y - state.pointerStart.y) / (height / rows))
    return state.mode === 'move' ? previewMoveRect(state.start, deltaCol, deltaRow, cols, rows) : previewResizeRect(state.start, { hx: 1, hy: 1 }, deltaCol, deltaRow, cols, rows)
  }

  const beginDrag = (mode: BoxDrag['mode'], event: ReactPointerEvent<HTMLElement>): void => {
    const element = surface()
    if (!element) return
    event.stopPropagation()
    boxRef.current?.setPointerCapture(event.pointerId)
    const pointer = relativePointerPos(event, element)
    setDrag({ mode, start: alert, pointerStart: pointer, pointer })
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const deltaCol = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    const deltaRow = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (deltaCol === 0 && deltaRow === 0) return
    event.preventDefault()
    if (event.shiftKey) onChange({ ...alert, colSpan: alert.colSpan + deltaCol, rowSpan: alert.rowSpan + deltaRow }, 'alert:resize')
    else onChange({ ...alert, col: alert.col + deltaCol, row: alert.row + deltaRow }, 'alert:move')
  }

  const rect = gridRect(width, height, cols, rows, drag ? dragRect(drag) : alert)

  return (
    <div
      ref={boxRef}
      className="alerts-box"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      tabIndex={0}
      role="group"
      aria-label="Alert box"
      title="Drag to move; drag the corner to resize. Arrow keys move; Shift+arrow keys resize."
      onPointerDown={(event) => beginDrag('move', event)}
      onPointerMove={(event) => {
        const element = surface()
        if (drag && element) setDrag({ ...drag, pointer: relativePointerPos(event, element) })
      }}
      onPointerUp={() => {
        if (drag) onChange(dragRect(drag))
        setDrag(null)
      }}
      onKeyDown={onKeyDown}
    >
      <span className="alerts-box-resize" onPointerDown={(event) => beginDrag('resize', event)} />
    </div>
  )
}
