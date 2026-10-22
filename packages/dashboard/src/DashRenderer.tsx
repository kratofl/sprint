// The shared dash renderer: one component that lays out a `DashLayout` page against a
// `TelemetryFrame` at an explicit pixel size. It drives the editor preview, the on-screen
// display, and an offscreen browser capture identically — nothing here branches on which of
// those three hosts is rendering it.

import React, { useRef } from 'react'
import { TirePosition, type AppSettings, type TelemetryFrame } from '@sprint/types'
import type { DashLayout, DashPage, DashWidget, DashWidgetStack } from './index'
import {
  alertPanelRect,
  gridRect,
  pageHasRaceLogicLapTimer,
  raceLogicPanelBounds,
  selectLayer,
  selectPage,
  subRect,
  type PixelRect,
} from './grid'
import { bareContent, CHROME_CELL_PX, GridOuterFrame, WidgetFrame, type ChromeContext } from './chrome'
import { effectiveColorSystem, resolveDashPalette, resolveStyleColor, withAlpha, type DashPaletteColors } from './palette'
import type { DashAlertBanner, DashLapSummaryPopup, DashSettingPopup } from './alerts'
import { narrowDashTargets, type DashTargets } from './bindings'
import { formatDelta, formatLap, formatSignedLiters } from './format'
import { Dot, TextLine, ValueWithUnit } from './primitives'
import { RaceLogicLapTimerPresenter } from './raceLogicLapTimer'
import { WidgetContent, widgetChrome } from './widgets'

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
  chrome: ChromeContext
  selected: boolean
  onSelect?: (widget: DashWidget) => void
}

/**
 * One widget's cell: its frame and title in the layout's dash style (see `widgetChrome`), then
 * its type-specific values in the content box. The RaceLogic lap timer draws nothing here — it
 * ignores its assigned grid cell entirely and renders as a full-canvas overlay instead — see
 * `RaceLogicLapTimerOverlay` below.
 */
function WidgetTile({ widget, rect, frame, settings, targets, palette, chrome, selected, onSelect }: WidgetTileProps): React.ReactElement | null {
  if (rect.width < 1 || rect.height < 1) {
    return null
  }

  const tilePalette = stylePalette(palette, widget.style)
  const spec = widgetChrome(widget, frame, tilePalette)
  const content = (box: { width: number; height: number }, contentPalette: DashPaletteColors): React.ReactNode => (
    <WidgetContent widget={widget} frame={frame} settings={settings} targets={targets} palette={contentPalette} width={box.width} height={box.height} chrome={chrome} />
  )
  const cell = { left: 0, top: 0, width: rect.width, height: rect.height }

  let body: React.ReactNode
  if (spec.kind === 'framed') {
    body = (
      <WidgetFrame ctx={chrome} rect={cell} title={spec.title} accent={spec.accent} fill={spec.fill} titleColor={resolveStyleColor(widget.style?.labelColor, palette)} palette={tilePalette}>
        {content}
      </WidgetFrame>
    )
  } else if (spec.kind === 'split') {
    body = content(cell, tilePalette)
  } else if (chrome.style === 'grid') {
    // The grid rules every cell, so an unframed widget still sits inside its lines.
    body = <WidgetFrame ctx={chrome} rect={cell} title={null} accent={null} fill={null} palette={tilePalette}>{content}</WidgetFrame>
  } else {
    const inset = bareContent(chrome, rect.width, rect.height)
    body = <div style={{ position: 'absolute', left: inset.left, top: inset.top, width: inset.width, height: inset.height }}>{content(inset, tilePalette)}</div>
  }

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
      {body}
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
  chrome: ChromeContext
  selectedId?: string
  onWidgetSelect?: (widget: DashWidget) => void
}

/** Renders a widget stack's selected layer, laid out in the stack's own local sub-grid. */
function WidgetStackTile({ stack, cols, rows, canvasWidth, canvasHeight, frame, settings, targets, palette, chrome, selectedId, onWidgetSelect }: WidgetStackTileProps): React.ReactElement | null {
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
          chrome={chrome}
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

/**
 * A setting change, from `DashAlertTracker.evaluate`. Full screen (the default) fills the whole
 * dash with the setting's color: its name and the old value on the left, the new value huge on
 * the right, so the driver reads which knob moved before the number. Inverted, it turns dark
 * with the color on the text. A centered popup sits in the alert's own grid rect instead.
 */
function AlertBanner({ banner, frame, palette, chrome, canvasWidth, canvasHeight }: { banner: DashAlertBanner; frame: TelemetryFrame; palette: DashPaletteColors; chrome: ChromeContext; canvasWidth: number; canvasHeight: number }): React.ReactElement | null {
  if (banner.kind === 'lapSummary') {
    return <LapSummaryScreen summary={banner} frame={frame} palette={palette} chrome={chrome} width={canvasWidth} height={canvasHeight} />
  }

  if (banner.fullScreen) {
    return <FullScreenSettingPopup banner={banner} palette={palette} width={canvasWidth} height={canvasHeight} />
  }

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

function FullScreenSettingPopup({ banner, palette, width, height }: { banner: DashSettingPopup; palette: DashPaletteColors; width: number; height: number }): React.ReactElement {
  const ink = banner.invertColors ? banner.color : palette.background
  const pad = Math.min(width, height) * 0.055
  // The value takes up to 55% of the width; its size comes from the setting's widest value ("00" or "00.0").
  const valueWidth = width * 0.55
  const valueSize = Math.min(height * 0.78, valueWidth / (Math.max(2, banner.value.length) * 0.56))
  const nameWidth = width - valueWidth - pad * 2
  const was = banner.max !== null ? `WAS ${banner.previous} · OF ${banner.max}` : `WAS ${banner.previous}`
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: banner.invertColors ? palette.background : banner.color,
        border: banner.invertColors ? `${Math.max(2, height * 0.01)}px solid ${banner.color}` : undefined,
        boxSizing: 'border-box',
      }}
    >
      <TextLine text={banner.title} left={pad} top={height * 0.46} size={height * 0.27} color={ink} align="start" maxWidth={nameWidth} weight="value" sizing="fit" />
      <TextLine text={was} left={pad} top={height * 0.66} size={height * 0.05} color={ink} align="start" maxWidth={nameWidth} weight="labelBold" sizing="fit" />
      <TextLine text={banner.value} left={width - pad} top={height / 2} size={valueSize} color={ink} align="end" maxWidth={valueWidth} weight="value" />
    </div>
  )
}

/** One number of the lap summary: its value, unit and a short verdict, on a condition fill when there is one. */
interface SummaryBlock {
  title: string
  value: string
  unit: string
  note: string
  fill: string | null
}

function lapBlock(summary: DashLapSummaryPopup, palette: DashPaletteColors): SummaryBlock {
  if (summary.lapDelta === null) return { title: 'LAP Δ', value: '--', unit: '', note: summary.valid ? 'NO BEST YET' : 'INVALID', fill: null }
  const best = summary.valid && summary.lapDelta < 0
  return { title: 'LAP Δ', value: formatDelta(summary.lapDelta), unit: '', note: !summary.valid ? 'INVALID' : best ? 'NEW BEST' : 'VS BEST', fill: best ? palette.timingPersonalBest : null }
}

function fuelBlock(summary: DashLapSummaryPopup, palette: DashPaletteColors): SummaryBlock {
  if (summary.fuelDelta !== null) {
    const over = summary.fuelDelta > 0
    return { title: 'FUEL Δ', value: formatSignedLiters(summary.fuelDelta), unit: 'L', note: over ? `SAVE ${summary.fuelDelta.toFixed(2)} L` : 'ON TARGET', fill: over ? palette.warning : palette.goodOnTarget }
  }
  if (summary.fuelUsed !== null) return { title: 'FUEL USED', value: summary.fuelUsed.toFixed(2), unit: 'L', note: 'NO TARGET SET', fill: null }
  return { title: 'FUEL USED', value: '--', unit: '', note: 'NOT MEASURED', fill: null }
}

/**
 * The lap summary, shown for a few seconds after each lap: the lap time, its delta to the
 * best before it, and the fuel the lap used against the plan's target. The gear stays in its
 * own column on the right, because the driver is still at speed. The two numbers wear the
 * layout's dash style, so the summary looks like the rest of the dash.
 */
function LapSummaryScreen({ summary, frame, palette, chrome, width, height }: { summary: DashLapSummaryPopup; frame: TelemetryFrame; palette: DashPaletteColors; chrome: ChromeContext; width: number; height: number }): React.ReactElement {
  const gearWidth = width * 0.19
  const gearHeight = Math.min(height, gearWidth * 2.3)
  const mainWidth = width - gearWidth
  const headHeight = height * 0.2
  const pad = 12 * chrome.scale
  const blocks = [lapBlock(summary, palette), fuelBlock(summary, palette)]
  const blockWidth = mainWidth / blocks.length
  return (
    <div style={{ position: 'absolute', inset: 0, background: palette.background }}>
      <TextLine text={`LAP ${summary.lap}`} left={pad} top={headHeight / 2} size={18 * chrome.scale} color={palette.secondary} align="start" maxWidth={mainWidth * 0.35} weight="labelBold" sizing="fit" />
      <TextLine text={formatLap(summary.lapTime)} left={mainWidth - pad} top={headHeight / 2} size={Math.min(headHeight * 0.72, mainWidth * 0.55 / (8 * 0.56))} color={palette.foreground} align="end" maxWidth={mainWidth * 0.6} weight="value" />
      {blocks.map((block, i) => (
        <WidgetFrame key={block.title} ctx={chrome} rect={{ left: i * blockWidth, top: headHeight, width: blockWidth, height: height - headHeight }} title={block.title} accent={null} fill={block.fill} palette={palette}>
          {(content, blockPalette) => (
            <>
              <ValueWithUnit value={block.value} unit={block.unit} left={content.width / 2} top={content.height * 0.44} size={Math.min(content.height * 0.5, (content.width * 0.96) / ((6 + 0.36) * 0.56))} color={blockPalette.foreground} unitColor={blockPalette.secondary} maxWidth={content.width} />
              <TextLine text={block.note} left={content.width / 2} top={content.height * 0.86} size={Math.min(content.height * 0.08, 16 * chrome.scale)} color={blockPalette.secondary} align="center" maxWidth={content.width} weight="labelBold" sizing="fit" />
            </>
          )}
        </WidgetFrame>
      ))}
      <div style={{ position: 'absolute', left: mainWidth, top: 0, width: gearWidth, height, borderLeft: `2px solid ${palette.border}`, boxSizing: 'border-box' }}>
        {/* The gear widget sizes its text from its height, so a narrow column gets a box no taller than the speed can fit across. */}
        <div style={{ position: 'absolute', left: 0, top: (height - gearHeight) / 2, width: gearWidth, height: gearHeight }}>
          <WidgetContent widget={SUMMARY_GEAR} frame={frame} palette={palette} width={gearWidth} height={gearHeight} targets={null} chrome={chrome} />
        </div>
      </div>
    </div>
  )
}

const SUMMARY_GEAR: DashWidget = { id: 'lap-summary-gear', type: 'gear_speed', col: 0, row: 0, colSpan: 1, rowSpan: 1 }

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
  const resolvedTargets = narrowDashTargets(targets)
  const telemetry = frame ?? EMPTY_TELEMETRY_FRAME

  // Focused purpose screens (currently only the RaceLogic lap timer) own their entire visual
  // language: the outer panel stays pure black and the flag overlay never covers it.
  const focusedLapTimer = layout.id === 'purpose-lap-times'
  const background = focusedLapTimer ? '#000000' : palette.background
  const chrome: ChromeContext = { style: layout.dashStyle ?? 'panels', scale: Math.min(width / cols, height / rows) / CHROME_CELL_PX }
  // The grid style rounds the whole canvas, so corner cells clip to its outer frame.
  const ruled = chrome.style === 'grid' && !focusedLapTimer

  return (
    <div className={`dash-canvas ${className ?? ''}`} style={{ position: 'relative', width, height, background, overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: ruled ? 14 * chrome.scale : undefined }}>
      {page?.widgets.map((widget) => (
        <WidgetTile
          key={widget.id}
          widget={widget}
          rect={gridRect(width, height, cols, rows, widget)}
          frame={telemetry}
          settings={resolvedSettings}
          targets={resolvedTargets}
          palette={palette}
          chrome={chrome}
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
          chrome={chrome}
          selectedId={selectedId}
          onWidgetSelect={onWidgetSelect}
        />
      ))}
      </div>
      {ruled && <GridOuterFrame ctx={chrome} width={width} height={height} palette={palette} />}
      {pageHasRaceLogicLapTimer(page) && <RaceLogicLapTimerOverlay frame={telemetry} palette={palette} canvasWidth={width} canvasHeight={height} />}
      {alertBanner && <AlertBanner banner={alertBanner} frame={telemetry} palette={palette} chrome={chrome} canvasWidth={width} canvasHeight={height} />}
      {!focusedLapTimer && <FlagOverlay frame={telemetry} palette={palette} canvasWidth={width} canvasHeight={height} />}
    </div>
  )
}
