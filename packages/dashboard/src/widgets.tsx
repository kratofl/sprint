// One React component per dash widget type, plus `widgetChrome`, which says how each type is
// framed. A framed widget's title, knob color and condition fill come from its chrome (see
// chrome.tsx); its component receives only the content box below the title, in pixels
// (`width`/`height`), and draws values laid out from fractions of that box.
//
// Static labels that must shrink to fit rather than clip use `TextLine`'s `sizing="fit"` — see
// `primitives.tsx` for the measurement-free SVG implementation. Everything else stays "stable"
// (authored size, clipped, no shrink), which is the default. Values size from a template of
// the widest text they can show (`valueSize`), so they never clip and never resize.

import React from 'react'
import { TirePosition, type AppSettings, type TelemetryFrame, type TireState } from '@sprint/types'
import type { DashWidget } from './index'
import { resolveBinding, type DashTargets } from './bindings'
import {
  formatDelta,
  formatFuel,
  formatFuelPerLap,
  formatFuelPerLapTarget,
  formatGap,
  formatGear,
  formatInt,
  formatLap,
  formatPressure,
  formatSpeedKph,
  formatTemp,
} from './format'
import { dashSettingColors, resolveTyreColor, type DashPaletteColors } from './palette'
import { BigValue, Dot, HBar, TextLine, ValueWithUnit, VerticalSegBar, valueSize, type TextAlign } from './primitives'
import { WidgetFrame, type ChromeContext } from './chrome'

export interface WidgetContentProps {
  widget: DashWidget
  frame: TelemetryFrame
  palette: DashPaletteColors
  width: number
  height: number
  targets: DashTargets | null
  settings?: Pick<AppSettings, 'driverName' | 'driverNumber'>
  /** The dash style, for `split` widgets that draw their own frames. */
  chrome: ChromeContext
}

/**
 * How a widget type is framed:
 * - `framed`: one frame with a title; `accent` is a knob's identity color and `fill` a
 *   condition color covering the frame (values then draw in ink).
 * - `bare`: no frame or title (gear, header, text, RPM, flag), just the same margin.
 * - `split`: the widget fills its whole cell with several frames of its own (the four tyres).
 */
export type WidgetChrome =
  | { kind: 'framed'; title: string; accent: string | null; fill: string | null }
  | { kind: 'bare' }
  | { kind: 'split' }

const framed = (title: string, accent: string | null = null, fill: string | null = null): WidgetChrome => ({ kind: 'framed', title, accent, fill })

/** Reads a string config value by key, or `undefined` when absent/not a string. */
function configString(config: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = config?.[key]
  return typeof value === 'string' ? value : undefined
}

/** The resolved flag priority text (RED > SC > VSC > YELLOW > CHECKERED > GREEN) and its color, shared by the header chip and the `flag` widget. */
function flagInfo(frame: TelemetryFrame, palette: DashPaletteColors): { text: string; color: string } {
  const summary = resolveBinding({ frame }, 'flags.summary')
  const text = typeof summary === 'string' ? summary : 'GREEN'
  switch (text) {
    case 'RED':
      return { text, color: palette.critical }
    case 'SC':
    case 'VSC':
    case 'YELLOW':
      return { text, color: palette.raceControlYellow }
    case 'CHECKERED':
      return { text, color: palette.neutral }
    default:
      return { text, color: palette.goodOnTarget }
  }
}

function rpmStageColor(phase: number, palette: DashPaletteColors): string {
  if (phase < 0.78) return palette.rpmNormal
  if (phase < 0.93) return palette.rpmNearLimit
  return palette.rpmShift
}

/** The frame a widget wears this frame: its title, knob color and any condition fill. */
export function widgetChrome(widget: DashWidget, frame: TelemetryFrame, palette: DashPaletteColors): WidgetChrome {
  switch (widget.type) {
    case 'input_trace': return framed('INPUTS')
    case 'sector': return framed('SECTORS')
    case 'lap_time': return framed('LAP TIMES')
    case 'delta': return framed('DELTA', null, deltaFill(frame, palette))
    case 'fuel': return framed('FUEL', null, fuelFill(frame.car.fuel, palette))
    case 'tc': return framed('TC', dashSettingColors.tc)
    case 'abs': return framed('ABS', dashSettingColors.abs)
    case 'engine_map': return framed('MAP', dashSettingColors.engineMap)
    case 'brake_bias': return framed('BIAS', dashSettingColors.brakeBias)
    case 'fuel_target': return framed('FUEL TARGET')
    case 'position': return framed('POS')
    case 'gaps': return framed('GAPS')
    case 'predictive_lap': return framed('PREDICTED')
    case 'virtual_energy': case 'ers': return framed('VIRTUAL ENERGY', null, energyFill(virtualEnergyPercent(frame), palette))
    case 'tyre_temp': case 'tyre_pressure': return { kind: 'split' }
    default: return { kind: 'bare' }
  }
}

/** Green while the lap is gaining on the target; no fill otherwise. A slower lap is never colored just for being slower. */
function deltaFill(frame: TelemetryFrame, palette: DashPaletteColors): string | null {
  return frame.lap.targetLapTime > 0 && frame.lap.delta < -0.0005 ? palette.timingPersonalBest : null
}

function fuelFill(liters: number, palette: DashPaletteColors): string | null {
  if (liters <= 0 || liters >= 5) return null
  return liters < 2 ? palette.critical : palette.warning
}

function energyFill(pct: number, palette: DashPaletteColors): string | null {
  if (pct <= 0 || pct >= 15) return null
  return pct < 5 ? palette.critical : palette.warning
}

function HeaderWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const mid: string[] = []
  if (frame.session.track) mid.push(frame.session.track)
  if (frame.session.car) mid.push(frame.session.car)
  if (frame.session.sessionType !== 'unknown') mid.push(frame.session.sessionType.toUpperCase())
  const centerText = mid.length > 0 ? mid.join('   ') : 'NO SESSION'
  const { text: flagText, color } = flagInfo(frame, palette)

  if (width < height * 5) {
    const topY = height * 0.32
    const bottomY = height * 0.72
    return (
      <>
        <TextLine text="SPRINT" left={4} top={topY} size={height * 0.23} color={palette.muted} align="start" maxWidth={width * 0.42} weight="labelBold" sizing="fit" />
        <TextLine text={flagText} left={width - height * 0.26} top={topY} size={height * 0.22} color={color} align="end" maxWidth={width * 0.34} weight="labelBold" sizing="fit" />
        <Dot cx={width - height * 0.1} cy={topY} r={height * 0.06} color={color} />
        <TextLine text={centerText} left={width / 2} top={bottomY} size={height * 0.2} color={palette.secondary} align="center" maxWidth={width * 0.92} weight="label" />
      </>
    )
  }

  const cy = height / 2
  const size = height * 0.42
  return (
    <>
      <TextLine text="SPRINT" left={8} top={cy} size={size} color={palette.muted} align="start" maxWidth={width * 0.18} weight="labelBold" sizing="fit" />
      <TextLine text={centerText} left={width * 0.2} top={cy} size={size} color={palette.secondary} align="start" maxWidth={width * 0.55} weight="label" />
      <TextLine text={flagText} left={width - height * 0.9 - 6} top={cy} size={height * 0.36} color={color} align="end" maxWidth={width * 0.2} weight="labelBold" sizing="fit" />
      <Dot cx={width - height * 0.4} cy={cy} r={height * 0.14} color={color} />
    </>
  )
}

function RpmBarWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement | null {
  const max = Math.max(1, frame.car.maxRPM)
  const pct = Math.max(0, Math.min(1, frame.car.rpm / max))
  if (width <= height * 2) {
    return <VerticalSegBar rect={{ left: 0, top: 0, width, height }} pct={pct} stageColor={(phase) => rpmStageColor(phase, palette)} />
  }

  const segments = 24
  const gap = Math.max(1, width * 0.0025)
  const segmentWidth = (width - gap * (segments - 1)) / segments
  const active = Math.ceil(pct * segments)
  const bars: React.ReactElement[] = []
  for (let i = 0; i < segments; i++) {
    const phase = i / (segments - 1)
    const color = rpmStageColor(phase, palette)
    bars.push(
      <div
        key={i}
        style={{ position: 'absolute', left: i * (segmentWidth + gap), top: 0, width: Math.max(0, segmentWidth), height, borderRadius: 2, background: i < active ? color : palette.surface }}
      />,
    )
  }

  return <>{bars}</>
}

function horizontalAnchor(config: Record<string, unknown> | undefined, width: number): { anchorX: number; align: TextAlign } {
  switch (configString(config, 'align')) {
    case 'left':
      return { anchorX: width * 0.06, align: 'start' }
    case 'right':
      return { anchorX: width * 0.94, align: 'end' }
    default:
      return { anchorX: width / 2, align: 'center' }
  }
}

function GearSpeedWidget({ widget, frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const rpmRatio = frame.car.maxRPM > 0 ? frame.car.rpm / frame.car.maxRPM : 0
  const gearColor = rpmRatio >= 0.96 ? palette.rpmShift : rpmRatio >= 0.88 ? palette.rpmNearLimit : palette.neutral
  const { anchorX, align } = horizontalAnchor(widget.config, width)
  return (
    <>
      <TextLine text={formatGear(frame.car.gear)} left={anchorX} top={height * 0.4} size={height * 0.6} color={gearColor} align={align} maxWidth={width * 0.9} weight="valueRegular" />
      <TextLine text={formatSpeedKph(frame.car.speedMS)} left={anchorX} top={height * 0.78} size={height * 0.19} color={palette.neutral} align={align} maxWidth={width * 0.9} weight="value" />
      <TextLine text="km/h" left={anchorX} top={height * 0.92} size={height * 0.09} color={palette.muted} align={align} maxWidth={width * 0.9} weight="label" sizing="fit" />
    </>
  )
}

function InputTraceWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const rows: { label: string; value: number; color: string; centered: boolean }[] = [
    { label: 'THR', value: frame.car.throttle, color: palette.goodOnTarget, centered: false },
    { label: 'BRK', value: frame.car.brake, color: palette.critical, centered: false },
    { label: 'CLU', value: frame.car.clutch, color: palette.secondary, centered: false },
    { label: 'STR', value: (frame.car.steering + 1) / 2, color: palette.secondary, centered: true },
  ]
  const rowHeight = height / rows.length
  const barLeft = width * 0.24
  return (
    <>
      {rows.map((row, i) => {
        const cy = rowHeight * (i + 0.5)
        const barH = Math.min(rowHeight * 0.55, 14)
        const pct = row.centered ? row.value * 2 - 1 : row.value
        return (
          <React.Fragment key={row.label}>
            <TextLine text={row.label} left={0} top={cy} size={Math.min(rowHeight * 0.6, 12)} color={palette.muted} align="start" maxWidth={barLeft - 4} weight="label" sizing="fit" />
            <HBar x={barLeft} y={cy - barH / 2} w={width - barLeft} h={barH} pct={pct} color={row.color} centered={row.centered} />
          </React.Fragment>
        )
      })}
    </>
  )
}

function SectorWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const current = Math.max(1, Math.min(3, frame.lap.sector))
  const gap = 6
  const pipW = Math.max(0, (width - gap * 2) / 3)
  const pipH = height * 0.36
  return (
    <>
      {[1, 2, 3].map((s) => {
        const px = (s - 1) * (pipW + gap)
        const active = s === current && frame.lap.sector > 0
        return (
          <React.Fragment key={s}>
            <TextLine text={`S${s}`} left={px + pipW / 2} top={pipH * 0.45} size={pipH * 0.62} color={active ? palette.primary : palette.muted} align="center" maxWidth={pipW} weight="labelBold" sizing="fit" />
            {active && <div style={{ position: 'absolute', left: px + pipW * 0.2, top: pipH * 0.92, width: pipW * 0.6, height: 3, borderRadius: 1.5, background: palette.primary }} />}
          </React.Fragment>
        )
      })}
      <TextLine text={formatLap(frame.lap.currentLapTime)} left={width / 2} top={pipH + (height - pipH) / 2} size={valueSize('0:00.000', width, height - pipH)} color={palette.neutral} align="center" maxWidth={width} weight="value" />
    </>
  )
}

function LapTimeWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const rows = [
    { label: 'NOW', value: formatLap(frame.lap.currentLapTime), color: palette.neutral },
    { label: 'LAST', value: formatLap(frame.lap.lastLapTime), color: palette.neutral },
    { label: 'BEST', value: formatLap(frame.lap.bestLapTime), color: palette.timingFastestOverall },
  ]
  const rowHeight = height / rows.length
  const labelWidth = width * 0.26
  const size = valueSize('0:00.000', width - labelWidth, rowHeight, 0.78)
  return (
    <>
      {rows.map((row, i) => {
        const cy = rowHeight * (i + 0.5)
        return (
          <React.Fragment key={row.label}>
            <TextLine text={row.label} left={0} top={cy} size={Math.min(size * 0.42, 14)} color={palette.secondary} align="start" maxWidth={labelWidth} weight="label" sizing="fit" />
            <TextLine text={row.value} left={width} top={cy} size={size} color={row.color} align="end" maxWidth={width - labelWidth} weight="value" />
          </React.Fragment>
        )
      })}
    </>
  )
}

function DeltaWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  if (frame.lap.targetLapTime <= 0) {
    return <TextLine text="NO TARGET" left={width / 2} top={height / 2} size={Math.min(height * 0.4, 20)} color={palette.muted} align="center" maxWidth={width * 0.9} weight="label" sizing="fit" />
  }

  return <BigValue text={formatDelta(frame.lap.delta)} template="-00.000" width={width} height={height} color={palette.neutral} />
}

function FuelWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const fuel = frame.car.fuel
  const perLap = frame.car.fuelPerLap
  const laps = perLap > 0.01 ? (fuel / perLap).toFixed(1) : null
  const value = laps ?? formatFuel(fuel)
  const unit = laps ? `laps · ${formatFuel(fuel)} L` : 'L'
  // The value plus its unit, measured in value-sized digits: "00.0" and "laps · 000.0 L" at 0.36.
  const size = Math.min(height * 0.7, (width * 0.96) / ((4 + 14 * 0.36) * 0.56))
  return <ValueWithUnit value={value} unit={unit} left={width / 2} top={height / 2} size={size} color={palette.foreground} unitColor={palette.secondary} maxWidth={width} />
}

const TIRE_CORNERS: { label: string; position: TirePosition }[] = [
  { label: 'FL', position: TirePosition.FrontLeft },
  { label: 'FR', position: TirePosition.FrontRight },
  { label: 'RL', position: TirePosition.RearLeft },
  { label: 'RR', position: TirePosition.RearRight },
]

/** The requested tyre channel, falling back to the tread sensors when an adapter fills only inner/middle/outer. */
function tyreTemperature(tire: TireState, useCore: boolean): number {
  if (useCore) return tire.tempCore
  if (tire.tempSurface > 0) return tire.tempSurface
  const readings = [tire.tempInner, tire.tempMiddle, tire.tempOuter].filter((value) => value > 0)
  return readings.length === 0 ? 0 : readings.reduce((sum, value) => sum + value, 0) / readings.length
}

/** Four tyre corners in car order, each its own frame in the dash style, splitting the widget's cell 2x2. */
function TyreCorners({ chrome, palette, width, height, corner }: { chrome: ChromeContext; palette: DashPaletteColors; width: number; height: number; corner: (position: TirePosition) => { title: string; value: string; template: string; fill: string | null } }): React.ReactElement {
  const cellW = width / 2
  const cellH = height / 2
  return (
    <>
      {TIRE_CORNERS.map((entry, i) => {
        const { title, value, template, fill } = corner(entry.position)
        const rect = { left: (i % 2) * cellW, top: Math.floor(i / 2) * cellH, width: cellW, height: cellH }
        return (
          <WidgetFrame key={entry.label} ctx={chrome} rect={rect} title={`${entry.label}${title}`} accent={null} fill={fill} palette={palette}>
            {(content, contentPalette) => <BigValue text={value} template={template} width={content.width} height={content.height} color={contentPalette.foreground} />}
          </WidgetFrame>
        )
      })}
    </>
  )
}

function TyreTempWidget({ widget, frame, palette, width, height, chrome }: WidgetContentProps): React.ReactElement {
  const useCore = configString(widget.config, 'channel') === 'core'
  return (
    <TyreCorners
      chrome={chrome}
      palette={palette}
      width={width}
      height={height}
      corner={(position) => {
        const temp = tyreTemperature(frame.tires[position], useCore)
        return { title: useCore ? ' CORE' : '', value: temp > 0 ? `${formatTemp(temp)}°` : '--', template: '000°', fill: temp > 0 ? resolveTyreColor(temp, palette) : null }
      }}
    />
  )
}

function TyrePressureWidget({ frame, palette, width, height, chrome }: WidgetContentProps): React.ReactElement {
  return (
    <TyreCorners
      chrome={chrome}
      palette={palette}
      width={width}
      height={height}
      corner={(position) => ({ title: ' KPA', value: formatPressure(frame.tires[position].pressureKPa), template: '000.0', fill: null })}
    />
  )
}

function FlagWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const { text, color } = flagInfo(frame, palette)
  if (width < height * 0.9) {
    const radius = Math.min(width * 0.18, height * 0.12)
    return (
      <>
        <Dot cx={width / 2} cy={height * 0.31} r={radius} color={color} />
        <TextLine text={text} left={width / 2} top={height * 0.68} size={Math.min(height * 0.18, width * 0.2)} color={color} align="center" maxWidth={width * 0.88} weight="valueRegular" sizing="fit" />
      </>
    )
  }

  const horizontalRadius = Math.min(height * 0.18, width * 0.09)
  return (
    <>
      <Dot cx={width * 0.12} cy={height / 2} r={horizontalRadius} color={color} />
      <TextLine text={text} left={width * 0.62} top={height / 2} size={Math.min(height * 0.32, width * 0.12)} color={color} align="center" maxWidth={width * 0.6} weight="valueRegular" sizing="fit" />
    </>
  )
}

function TcWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const color = frame.electronics.tcActive ? palette.assistActive : palette.neutral
  return <BigValue text={String(Math.trunc(frame.electronics.tc))} template="00" width={width} height={height} color={color} />
}

function AbsWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  return <BigValue text={String(Math.trunc(frame.electronics.abs))} template="00" width={width} height={height} color={palette.neutral} />
}

function EngineMapWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  return <BigValue text={String(Math.trunc(frame.electronics.motorMap))} template="00" width={width} height={height} color={palette.neutral} />
}

/**
 * Discrepancy carried from bindings.ts: CarState.brakeBiasRear is a 0-1 fraction here, a
 * percentage in the desktop model, so it is scaled to keep this readout consistent with the
 * "car.brakeBiasRear" text binding. Shared with the bias-change popup.
 */
export function formatBrakeBias(frame: TelemetryFrame): string {
  return (frame.car.brakeBiasRear * 100).toFixed(1)
}

function BrakeBiasWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  return <BigValue text={formatBrakeBias(frame)} template="00.0" width={width} height={height} color={palette.neutral} />
}

function FuelTargetWidget({ targets, palette, width, height }: WidgetContentProps): React.ReactElement {
  const size = Math.min(height * 0.7, (width * 0.96) / ((4 + 5 * 0.36) * 0.56))
  return <ValueWithUnit value={formatFuelPerLapTarget(targets?.fuelPerLapLiters ?? null)} unit="L/lap" left={width / 2} top={height / 2} size={size} color={palette.foreground} unitColor={palette.secondary} maxWidth={width} />
}

function PositionWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const value = frame.race.position > 0 ? `P${frame.race.position}` : 'P--'
  const unit = frame.race.totalPositions > 0 ? `/${frame.race.totalPositions}` : ''
  const size = Math.min(height * 0.7, (width * 0.96) / ((3 + 3 * 0.36) * 0.56))
  return <ValueWithUnit value={value} unit={unit} left={width / 2} top={height / 2} size={size} color={palette.foreground} unitColor={palette.secondary} maxWidth={width} />
}

function GapsWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const ahead = formatGap(frame.race.gapAhead)
  const behind = formatGap(frame.race.gapBehind)
  const half = width / 2
  const labelTop = height * 0.18
  const size = valueSize('+00.000', half - 6, height * 0.64, 0.9)
  return (
    <>
      <TextLine text="AHEAD" left={0} top={labelTop} size={Math.min(height * 0.26, 12)} color={palette.secondary} align="start" maxWidth={half - 6} weight="label" sizing="fit" />
      <TextLine text={ahead === '--' ? '--' : `-${ahead}`} left={0} top={height * 0.66} size={size} color={palette.foreground} align="start" maxWidth={half - 6} weight="value" />
      <TextLine text="BEHIND" left={width} top={labelTop} size={Math.min(height * 0.26, 12)} color={palette.secondary} align="end" maxWidth={half - 6} weight="label" sizing="fit" />
      <TextLine text={behind === '--' ? '--' : `+${behind}`} left={width} top={height * 0.66} size={size} color={palette.foreground} align="end" maxWidth={half - 6} weight="value" />
    </>
  )
}

function PredictiveLapWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  return <BigValue text={formatLap(frame.lap.targetLapTime)} template="0:00.000" width={width} height={height} color={palette.foreground} />
}

/** The virtual-energy level as a percentage, tolerating a 0..1 or a 0..100 source scale. */
function virtualEnergyPercent(frame: TelemetryFrame): number {
  const raw = frame.energy.virtualEnergy
  return raw > 0 && raw <= 1 ? raw * 100 : raw
}

/**
 * The LMU virtual-energy budget. The "mode" config picks the readout; all three tolerate 0..1
 * or 0..100 source scales by normalising off the current level and applying the same factor to
 * the per-lap delta so "laps remaining" stays scale-independent.
 */
function VirtualEnergyWidget({ widget, frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const raw = frame.energy.virtualEnergy
  const scale = raw > 0 && raw <= 1 ? 100 : 1
  const pct = raw * scale
  const mode = configString(widget.config, 'mode') === 'percent' ? 'percent' : configString(widget.config, 'mode') === 'power' ? 'power' : 'budget'
  const level = pct > 0 ? `${pct.toFixed(1)}` : '--'

  if (mode === 'percent') {
    const barH = Math.min(height * 0.14, 10)
    const barColor = pct < 5 ? palette.critical : pct < 15 ? palette.warning : palette.neutral
    const size = Math.min((height - barH - 6) * 0.8, (width * 0.96) / ((4 + 1 * 0.36) * 0.56))
    return (
      <>
        <ValueWithUnit value={level} unit="%" left={width / 2} top={(height - barH - 6) / 2} size={size} color={palette.neutral} unitColor={palette.secondary} maxWidth={width} />
        <HBar x={0} y={height - barH} w={width} h={barH} pct={pct / 100} color={barColor} centered={false} />
      </>
    )
  }

  const left = width * 0.55
  const size = Math.min(height * 0.7, (left * 0.96) / ((4 + 1 * 0.36) * 0.56))
  const side = Math.min(height * 0.24, 16)
  const lines = mode === 'power'
    ? [frame.energy.deployPower > 0 ? `DEP ${formatInt(frame.energy.deployPower)} kW` : 'DEP -- kW', frame.energy.regenPower > 0 ? `REGEN ${formatInt(frame.energy.regenPower)} kW` : 'REGEN -- kW']
    : [frame.energy.virtualEnergyPerLap * scale > 0.0001 ? `${(frame.energy.virtualEnergyPerLap * scale).toFixed(1)} %/lap` : '-- %/lap', frame.energy.virtualEnergyPerLap > 0.0001 ? `~${formatInt(raw / frame.energy.virtualEnergyPerLap)} laps` : '~-- laps']
  return (
    <>
      <ValueWithUnit value={level} unit="%" left={0} top={height / 2} size={size} color={palette.neutral} unitColor={palette.secondary} align="start" maxWidth={left} />
      <TextLine text={lines[0]} left={width} top={height * 0.3} size={side} color={palette.secondary} align="end" maxWidth={width - left} weight="value" />
      <TextLine text={lines[1]} left={width} top={height * 0.72} size={side} color={palette.muted} align="end" maxWidth={width - left} weight="label" />
    </>
  )
}

/** A resolved binding value, stringified the same naive way as `DashBindingResolver.Resolve(...)?.ToString()` — no per-type formatting, unlike the dedicated widgets above. */
function stringifyBindingValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return String(value)
  return ''
}

function TextWidget({ widget, frame, palette, width, height, targets, settings }: WidgetContentProps): React.ReactElement {
  const content = configString(widget.config, 'content')
  const binding = configString(widget.config, 'binding')
  const resolved = binding ? stringifyBindingValue(resolveBinding({ frame, settings, targets }, binding)) : ''
  const display = resolved || content || widget.id
  return <TextLine text={display} left={width / 2} top={height / 2} size={height * 0.45} color={palette.foreground} align="center" maxWidth={width * 0.94} weight="value" />
}

/** The RaceLogic-style purpose display draws itself as a full-canvas overlay (see `RaceLogicLapTimerOverlay` in DashRenderer.tsx), ignoring its assigned grid cell entirely. */
function RaceLogicInPlaceWidget(): null {
  return null
}

function UnknownWidget({ widget, palette, width, height }: WidgetContentProps): React.ReactElement {
  return <TextLine text={widget.type.toUpperCase()} left={width / 2} top={height / 2} size={height * 0.2} color={palette.muted} align="center" maxWidth={width * 0.9} weight="label" sizing="fit" />
}

/** The dash widget catalog (`DashWidgetCatalog.cs`), in the order it is defined there. */
export const dashboardWidgetTypes = [
  'header',
  'text',
  'rpm_bar',
  'gear_speed',
  'input_trace',
  'sector',
  'lap_time',
  'delta',
  'fuel',
  'tyre_temp',
  'flag',
  'tc',
  'abs',
  'engine_map',
  'brake_bias',
  'fuel_target',
  'position',
  'gaps',
  'predictive_lap',
  'racelogic_lap_timer',
  'tyre_pressure',
  'virtual_energy',
] as const

export type DashWidgetType = (typeof dashboardWidgetTypes)[number]

const WIDGET_TYPE_SET: ReadonlySet<string> = new Set(dashboardWidgetTypes)

export function isDashWidgetType(type: string): type is DashWidgetType {
  return WIDGET_TYPE_SET.has(type)
}

const WIDGET_COMPONENTS: Record<DashWidgetType, (props: WidgetContentProps) => React.ReactElement | null> = {
  header: HeaderWidget,
  text: TextWidget,
  rpm_bar: RpmBarWidget,
  gear_speed: GearSpeedWidget,
  input_trace: InputTraceWidget,
  sector: SectorWidget,
  lap_time: LapTimeWidget,
  delta: DeltaWidget,
  fuel: FuelWidget,
  tyre_temp: TyreTempWidget,
  flag: FlagWidget,
  tc: TcWidget,
  abs: AbsWidget,
  engine_map: EngineMapWidget,
  brake_bias: BrakeBiasWidget,
  fuel_target: FuelTargetWidget,
  position: PositionWidget,
  gaps: GapsWidget,
  predictive_lap: PredictiveLapWidget,
  racelogic_lap_timer: RaceLogicInPlaceWidget,
  tyre_pressure: TyrePressureWidget,
  virtual_energy: VirtualEnergyWidget,
}

/**
 * Dispatches a widget to its type-specific renderer. `"ers"` is the pre-migration alias for
 * `"virtual_energy"` that `DashWidgetCatalog.cs` documents as still handled defensively for
 * un-migrated layouts. Any other unknown type falls back to a muted placeholder instead of
 * throwing.
 */
export function WidgetContent(props: WidgetContentProps): React.ReactElement | null {
  if (props.widget.type === 'ers') {
    return <VirtualEnergyWidget {...props} />
  }

  if (isDashWidgetType(props.widget.type)) {
    const Component = WIDGET_COMPONENTS[props.widget.type]
    return <Component {...props} />
  }

  return <UnknownWidget {...props} />
}
