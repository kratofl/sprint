// The shared dash renderer: one component that lays out a `DashLayout` page against a
// `TelemetryFrame` at an explicit pixel size. It drives the editor preview, the on-screen
// display, and an offscreen browser capture identically — nothing here branches on which of
// those three hosts is rendering it.

import React, { useRef } from 'react'
import { TirePosition, type AppSettings, type TelemetryFrame } from '@sprint/types'
import type { DashLayout, DashPage, DashWidget, DashWidgetStack } from './index'
import {
  alertPanelRect,
  contentRect,
  gridRect,
  pageHasRaceLogicLapTimer,
  raceLogicPanelBounds,
  selectLayer,
  selectPage,
  subRect,
  usesInstrumentFrame,
  type PixelRect,
} from './grid'
import { effectiveColorSystem, resolveDashPalette, resolveStyleColor, withAlpha, type DashPaletteColors } from './palette'
import type { DashAlertBanner } from './alerts'
import type { DashTargets } from './bindings'
import { formatLap } from './format'
import { Dot, PanelBorder, TextLine } from './primitives'
import { RaceLogicLapTimerPresenter } from './raceLogicLapTimer'
import { WidgetContent } from './widgets'

export interface DashRendererProps {
  layout: DashLayout
  frame?: TelemetryFrame | null
  width: number
  height: number
  pageId?: string
  idle?: boolean
  /** The raw `settings`/`targets` bags produced by `parseDashRenderInput` — narrowed once, here, to the fields this renderer actually reads. */
  settings?: Record<string, unknown>
  targets?: Record<string, unknown>
  /** A precomputed alert state (from `DashAlertTracker.evaluate`). The renderer stays a pure function of its props — it does not track alert history itself. */
  alertBanner?: DashAlertBanner | null
  className?: string
  selectedId?: string
  onWidgetSelect?: (widget: DashWidget) => void
}

const EMPTY_TIRE = { tempInner: 0, tempMiddle: 0, tempOuter: 0, tempSurface: 0, tempCore: 0, pressureKPa: 0, wearPercent: 0, compound: '' }

/** Fed to every widget when no live frame is available yet (e.g. before the game connects), so widgets always have a concrete frame to read and show their normal "no data" placeholders instead of the host needing a null-frame branch. */
const EMPTY_TELEMETRY_FRAME: TelemetryFrame = {
  timestamp: 0,
  session: { game: '', track: '', trackLengthMeters: null, car: '', carClass: '', sessionType: 'unknown', sessionTime: 0, totalSessionTime: null, sessionTimeRemaining: null, bestLapTime: 0, maxLaps: 0, inCar: false },
  car: { speedMS: 0, gear: 0, rpm: 0, maxRPM: 0, throttle: 0, brake: 0, clutch: 0, steering: 0, fuel: 0, fuelPerLap: 0, positionX: 0, positionY: 0, positionZ: 0, brakeBiasRear: 0.5 },
  tires: [
    { position: TirePosition.FrontLeft, ...EMPTY_TIRE },
    { position: TirePosition.FrontRight, ...EMPTY_TIRE },
    { position: TirePosition.RearLeft, ...EMPTY_TIRE },
    { position: TirePosition.RearRight, ...EMPTY_TIRE },
  ],
  lap: { currentLap: 0, currentLapTime: 0, positionLapTime: 0, lastLapTime: 0, bestLapTime: 0, targetLapTime: 0, delta: 0, sector: 0, sector1Time: 0, sector2Time: 0, lastLapSectorsSeconds: [], isInLap: false, isOutLap: false, isValid: true, trackPosition: 0 },
  flags: { yellow: false, doubleYellow: false, red: false, safetyCar: false, vsc: false, checkered: false },
  electronics: { tcActive: false, tc: 0, tcMax: 0, tcCut: 0, tcCutMax: 0, tcSlip: 0, tcSlipMax: 0, absActive: false, abs: 0, absMax: 0, motorMap: 0, motorMapMax: 0, drsActive: false, absAvailable: false, tcAvailable: false, tcCutAvailable: false, tcSlipAvailable: false, motorMapAvailable: false },
  race: { position: 0, totalPositions: 0, gapAhead: 0, gapBehind: 0 },
  energy: { virtualEnergy: 0, virtualEnergyPerLap: 0, soc: 0, regenPower: 0, deployPower: 0 },
  penalties: { incidents: 0, trackLimitSteps: 0, pitStops: 0 },
  conditions: { pathWetness: null, trackGripLevel: null, fuelMultiplier: null, tireMultiplier: null, fixedSetup: null },
}

function narrowSettings(raw: Record<string, unknown> | undefined): Pick<AppSettings, 'driverName' | 'driverNumber'> | undefined {
  if (!raw) return undefined
  return {
    driverName: typeof raw.driverName === 'string' ? raw.driverName : undefined,
    driverNumber: typeof raw.driverNumber === 'string' ? raw.driverNumber : undefined,
  }
}

function narrowTargets(raw: Record<string, unknown> | undefined): DashTargets | null {
  if (!raw) return null
  return {
    lapTimeSeconds: typeof raw.lapTimeSeconds === 'number' ? raw.lapTimeSeconds : null,
    fuelPerLapLiters: typeof raw.fuelPerLapLiters === 'number' ? raw.fuelPerLapLiters : null,
  }
}

/** The base palette with a widget's own text/label color overrides applied. */
function stylePalette(base: DashPaletteColors, style: DashWidget['style']): DashPaletteColors {
  if (!style || (!style.textColor && !style.labelColor)) {
    return base
  }

  const text = resolveStyleColor(style.textColor, base)
  const label = resolveStyleColor(style.labelColor, base)
  return { ...base, foreground: text ?? base.foreground, neutral: text ?? base.neutral, muted: label ?? base.muted }
}

interface WidgetTileProps {
  widget: DashWidget
  rect: PixelRect
  frame: TelemetryFrame
  settings?: Pick<AppSettings, 'driverName' | 'driverNumber'>
  targets: DashTargets | null
  palette: DashPaletteColors
  selected: boolean
  onSelect?: (widget: DashWidget) => void
}

/**
 * One widget's outer cell: an optional instrument-frame border, then its type-specific content
 * inset inside it. The RaceLogic lap timer draws nothing here — it ignores its assigned grid
 * cell entirely and renders as a full-canvas overlay instead — see `RaceLogicLapTimerOverlay`
 * below.
 */
function WidgetTile({ widget, rect, frame, settings, targets, palette, selected, onSelect }: WidgetTileProps): React.ReactElement | null {
  if (rect.width < 1 || rect.height < 1) {
    return null
  }

  const showBorder = widget.style?.border ?? usesInstrumentFrame(widget.type)
  const inset = contentRect(rect, widget.type)
  const tilePalette = stylePalette(palette, widget.style)
  return (
    <div
      className={`dash-widget-tile dash-widget-${widget.type}${selected ? ' is-selected' : ''}`}
      style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        outline: selected ? `2px solid ${palette.primary}` : undefined,
        outlineOffset: selected ? -2 : undefined,
      }}
      onClick={onSelect ? () => onSelect(widget) : undefined}
    >
      {showBorder && <PanelBorder width={rect.width} height={rect.height} color={tilePalette.border} />}
      <div style={{ position: 'absolute', left: inset.left - rect.left, top: inset.top - rect.top, width: Math.max(0, inset.width), height: Math.max(0, inset.height) }}>
        <WidgetContent widget={widget} frame={frame} settings={settings} targets={targets} palette={tilePalette} width={Math.max(0, inset.width)} height={Math.max(0, inset.height)} />
      </div>
    </div>
  )
}

interface WidgetStackTileProps {
  stack: DashWidgetStack
  cols: number
  rows: number
  canvasWidth: number
  canvasHeight: number
  frame: TelemetryFrame
  settings?: Pick<AppSettings, 'driverName' | 'driverNumber'>
  targets: DashTargets | null
  palette: DashPaletteColors
  selectedId?: string
  onWidgetSelect?: (widget: DashWidget) => void
}

/** Renders a widget stack's selected layer, laid out in the stack's own local sub-grid. */
function WidgetStackTile({ stack, cols, rows, canvasWidth, canvasHeight, frame, settings, targets, palette, selectedId, onWidgetSelect }: WidgetStackTileProps): React.ReactElement | null {
  const outerRect = gridRect(canvasWidth, canvasHeight, cols, rows, { col: stack.col, row: stack.row, colSpan: Math.max(1, stack.colSpan), rowSpan: Math.max(1, stack.rowSpan) })
  if (outerRect.width < 1 || outerRect.height < 1) {
    return null
  }

  const layer = selectLayer(stack)
  if (!layer) {
    return null
  }

  const subCols = Math.max(1, stack.colSpan)
  const subRows = Math.max(1, stack.rowSpan)
  return (
    <>
      {layer.widgets.map((widget) => (
        <WidgetTile
          key={widget.id}
          widget={widget}
          rect={subRect(outerRect, subCols, subRows, widget)}
          frame={frame}
          settings={settings}
          targets={targets}
          palette={palette}
          selected={selectedId === widget.id}
          onSelect={onWidgetSelect}
        />
      ))}
    </>
  )
}

/** The full-screen flag-state tint and bottom banner. Only red/safety-car/yellow trigger it — a narrower set than the header chip's full flag priority. */
function flagOverlayInfo(frame: TelemetryFrame, palette: DashPaletteColors): { text: string; color: string } | null {
  if (!frame.flags.red && !frame.flags.safetyCar && !frame.flags.yellow) {
    return null
  }

  if (frame.flags.red) return { text: 'RED FLAG', color: palette.critical }
  if (frame.flags.safetyCar) return { text: 'SAFETY CAR', color: palette.raceControlYellow }
  return { text: 'YELLOW FLAG', color: palette.raceControlYellow }
}

function FlagOverlay({ frame, palette, canvasWidth, canvasHeight }: { frame: TelemetryFrame; palette: DashPaletteColors; canvasWidth: number; canvasHeight: number }): React.ReactElement | null {
  const info = flagOverlayInfo(frame, palette)
  if (!info) {
    return null
  }

  const barHeight = Math.max(20, canvasHeight * 0.06)
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: withAlpha(info.color, 25 / 255) }} />
      <div style={{ position: 'absolute', left: 0, top: canvasHeight - barHeight, width: canvasWidth, height: barHeight, background: info.color }}>
        <TextLine text={info.text} left={canvasWidth / 2} top={barHeight / 2} size={barHeight * 0.6} color={palette.background} align="center" maxWidth={canvasWidth} weight="labelBold" sizing="fit" />
      </div>
    </div>
  )
}

/** A transient parameter-change banner over the grid, from `DashAlertTracker.evaluate`. */
function AlertBanner({ banner, palette, canvasWidth, canvasHeight }: { banner: DashAlertBanner; palette: DashPaletteColors; canvasWidth: number; canvasHeight: number }): React.ReactElement | null {
  const panel = alertPanelRect(canvasWidth, canvasHeight, banner)
  if (panel.width < 4 || panel.height < 4) {
    return null
  }

  const radius = Math.max(8, Math.min(panel.width, panel.height) * 0.06)
  const fill = banner.invertColors ? banner.color : 'rgba(8, 8, 10, 0.965)'
  const borderColor = banner.invertColors ? palette.background : banner.color
  const titleColor = banner.invertColors ? palette.background : banner.color
  const valueColor = banner.invertColors ? palette.background : palette.foreground
  return (
    <div
      style={{
        position: 'absolute',
        left: panel.left,
        top: panel.top,
        width: panel.width,
        height: panel.height,
        borderRadius: radius,
        background: fill,
        border: `${Math.max(1.5, panel.height * 0.008)}px solid ${borderColor}`,
        boxSizing: 'border-box',
      }}
    >
      <TextLine text={banner.title} left={panel.width / 2} top={panel.height * 0.25} size={panel.height * 0.13} color={titleColor} align="center" maxWidth={panel.width * 0.86} weight="labelBold" sizing="fit" />
      <TextLine text={banner.value} left={panel.width / 2} top={panel.height * 0.64} size={panel.height * 0.52} color={valueColor} align="center" maxWidth={panel.width * 0.84} weight="value" />
    </div>
  )
}

/**
 * The RaceLogic-style purpose display: a fixed 4:1 island centered on the whole canvas,
 * independent of any widget's assigned grid cell, backed by `RaceLogicLapTimerPresenter`.
 * The presenter is stateful (it watches for a lap boundary to freeze the result briefly), so
 * one instance lives for the renderer's lifetime.
 */
function RaceLogicLapTimerOverlay({ frame, palette, canvasWidth, canvasHeight }: { frame: TelemetryFrame; palette: DashPaletteColors; canvasWidth: number; canvasHeight: number }): React.ReactElement | null {
  const presenterRef = useRef<RaceLogicLapTimerPresenter | null>(null)
  if (!presenterRef.current) {
    presenterRef.current = new RaceLogicLapTimerPresenter()
  }

  const bounds = raceLogicPanelBounds(canvasWidth, canvasHeight)
  if (bounds.width < 1 || bounds.height < 1) {
    return null
  }

  const inset = Math.max(2, bounds.height * 0.035)
  const content = { width: Math.max(0, bounds.width - inset * 2), height: Math.max(0, bounds.height - inset * 2) }
  const view = presenterRef.current.present(frame, Date.now())
  const speed = Math.max(0, frame.car.speedMS * 3.6)
  const barLeft = content.width * 0.2
  const barRight = content.width * 0.66

  return (
    <div style={{ position: 'absolute', left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}>
      <div style={{ position: 'absolute', left: inset, top: inset, width: content.width, height: content.height }}>
        <TextLine text={view.primary} left={content.width * 0.43} top={content.height * 0.48} size={content.height * 0.42} color={palette.neutral} align="center" maxWidth={content.width * 0.72} weight="value" />
        {view.showDeltaBar && (
          <>
            <div style={{ position: 'absolute', left: barLeft, top: content.height * 0.66, width: barRight - barLeft, height: Math.max(1, content.height * 0.012), background: 'rgb(60, 64, 68)' }} />
            <Dot cx={content.width * 0.5 + Math.max(-1, Math.min(1, view.delta / 2)) * (barRight - barLeft) * 0.5} cy={content.height * 0.66} r={Math.max(2, content.height * 0.025)} color={palette.neutral} />
          </>
        )}
        <TextLine text={speed.toFixed(0)} left={content.width - content.width * 0.03} top={content.height * 0.38} size={content.height * 0.18} color={palette.foreground} align="end" maxWidth={content.width * 0.2} weight="value" />
        <TextLine text="km/h" left={content.width - content.width * 0.03} top={content.height * 0.54} size={content.height * 0.08} color={palette.muted} align="end" maxWidth={content.width * 0.2} weight="label" sizing="fit" />
        <TextLine text={`LAP ${Math.max(1, frame.lap.currentLap)}`} left={0} top={content.height * 0.82} size={content.height * 0.1} color={palette.muted} align="start" maxWidth={content.width * 0.23} weight="labelBold" />
        <TextLine text={view.status} left={content.width / 2} top={content.height * 0.82} size={content.height * 0.1} color={palette.secondary} align="center" maxWidth={content.width * 0.48} weight="label" />
        <TextLine text={`BEST ${formatLap(frame.lap.bestLapTime)}`} left={content.width} top={content.height * 0.82} size={content.height * 0.1} color={palette.muted} align="end" maxWidth={content.width * 0.29} weight="label" />
      </div>
    </div>
  )
}

/**
 * Renders one page of `layout` against `frame` at an explicit pixel `width`/`height`. Sizing is
 * driven entirely by those two numbers — no `vw`/`vh`, no media queries — so the same markup is
 * correct in the editor's flexible preview pane, an on-screen window, and an offscreen capture
 * at a fixed USB-panel resolution.
 */
export function DashRenderer({ layout, frame, width, height, pageId, idle, settings, targets, alertBanner, className, selectedId, onWidgetSelect }: DashRendererProps): React.ReactElement {
  const colorSystem = effectiveColorSystem(layout)
  const palette = resolveDashPalette(layout.theme, colorSystem)
  const page: DashPage | null = selectPage(layout, pageId, idle ?? false)
  const cols = layout.gridCols > 0 ? layout.gridCols : 20
  const rows = layout.gridRows > 0 ? layout.gridRows : 12
  const resolvedSettings = narrowSettings(settings)
  const resolvedTargets = narrowTargets(targets)
  const telemetry = frame ?? EMPTY_TELEMETRY_FRAME

  // Focused purpose screens (currently only the RaceLogic lap timer) own their entire visual
  // language: the outer panel stays pure black and the flag overlay never covers it.
  const focusedLapTimer = layout.id === 'purpose-lap-times'
  const background = focusedLapTimer ? '#000000' : palette.background

  return (
    <div className={`dash-canvas ${className ?? ''}`} style={{ position: 'relative', width, height, background, overflow: 'hidden', boxSizing: 'border-box' }}>
      {page?.widgets.map((widget) => (
        <WidgetTile
          key={widget.id}
          widget={widget}
          rect={gridRect(width, height, cols, rows, widget)}
          frame={telemetry}
          settings={resolvedSettings}
          targets={resolvedTargets}
          palette={palette}
          selected={selectedId === widget.id}
          onSelect={onWidgetSelect}
        />
      ))}
      {page?.widgetStacks?.map((stack) => (
        <WidgetStackTile
          key={stack.id}
          stack={stack}
          cols={cols}
          rows={rows}
          canvasWidth={width}
          canvasHeight={height}
          frame={telemetry}
          settings={resolvedSettings}
          targets={resolvedTargets}
          palette={palette}
          selectedId={selectedId}
          onWidgetSelect={onWidgetSelect}
        />
      ))}
      {pageHasRaceLogicLapTimer(page) && <RaceLogicLapTimerOverlay frame={telemetry} palette={palette} canvasWidth={width} canvasHeight={height} />}
      {alertBanner && <AlertBanner banner={alertBanner} palette={palette} canvasWidth={width} canvasHeight={height} />}
      {!focusedLapTimer && <FlagOverlay frame={telemetry} palette={palette} canvasWidth={width} canvasHeight={height} />}
    </div>
  )
}
