// One React component per dash widget type. Each component receives the widget's already-inset
// content box in pixels (`width`/`height`) and lays itself out from fractions of that box.
//
// Static labels that must shrink to fit rather than clip use `TextLine`'s `sizing="fit"` — see
// `primitives.tsx` for the measurement-free SVG implementation. Everything else stays "stable"
// (authored size, clipped, no shrink), which is the default.

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
import { resolveTyreColor, withAlpha, type DashPaletteColors } from './palette'
import { DeltaBar, Dot, HBar, SimpleValue, TextLine, VerticalSegBar, type TextAlign } from './primitives'

export interface WidgetContentProps {
  widget: DashWidget
  frame: TelemetryFrame
  palette: DashPaletteColors
  width: number
  height: number
  targets: DashTargets | null
  settings?: Pick<AppSettings, 'driverName' | 'driverNumber'>
}

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
  const barXFrac = 0.24
  const barWFrac = 0.72
  const barHFrac = 0.13
  return (
    <>
      {rows.map((row, i) => {
        const cy = (0.16 + i * 0.24) * height
        const barH = barHFrac * height
        const pct = row.centered ? row.value * 2 - 1 : row.value
        return (
          <React.Fragment key={row.label}>
            <TextLine text={row.label} left={width * (barXFrac - 0.02)} top={cy} size={height * 0.11} color={palette.muted} align="end" maxWidth={width * barXFrac} weight="label" sizing="fit" />
            <HBar x={barXFrac * width} y={cy - barH / 2} w={barWFrac * width} h={barH} pct={pct} color={row.color} centered={row.centered} />
          </React.Fragment>
        )
      })}
    </>
  )
}

function SectorWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const current = Math.max(1, Math.min(3, frame.lap.sector))
  const pipW = width / 3.2
  const pipH = height * 0.3
  const pipY = height * 0.42
  return (
    <>
      <TextLine text="SECTORS" left={8} top={height * 0.18} size={height * 0.16} color={palette.muted} align="start" maxWidth={width * 0.6} weight="label" sizing="fit" />
      {[1, 2, 3].map((s) => {
        const px = 8 + (s - 1) * (pipW + 6)
        const active = s === current && frame.lap.sector > 0
        return (
          <React.Fragment key={s}>
            <TextLine text={`S${s}`} left={px + pipW / 2} top={pipY + pipH / 2} size={pipH * 0.6} color={active ? palette.primary : palette.muted} align="center" maxWidth={pipW} weight="labelBold" sizing="fit" />
            {active && <div style={{ position: 'absolute', left: px + pipW * 0.2, top: pipY + pipH + 3, width: pipW * 0.6, height: 3, borderRadius: 1.5, background: palette.primary }} />}
          </React.Fragment>
        )
      })}
      <TextLine text={formatLap(frame.lap.currentLapTime)} left={width - 8} top={height - height * 0.16} size={height * 0.22} color={palette.neutral} align="end" maxWidth={width * 0.6} weight="value" />
    </>
  )
}

function LapTimeWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const titleSize = Math.min(26, height * 0.09)
  const labelSize = Math.min(22, height * 0.085)
  const valueSize = Math.min(32, height * 0.115)
  const rows = [
    { label: 'NOW', value: formatLap(frame.lap.currentLapTime), color: palette.neutral },
    { label: 'LAST', value: formatLap(frame.lap.lastLapTime), color: palette.neutral },
    { label: 'BEST', value: formatLap(frame.lap.bestLapTime), color: palette.timingFastestOverall },
  ]
  return (
    <>
      <TextLine text="LAP TIMES" left={10} top={height * 0.12} size={titleSize} color={palette.muted} align="start" maxWidth={width} weight="label" sizing="fit" />
      {rows.map((row, i) => {
        const cy = height * (0.38 + i * 0.24)
        return (
          <React.Fragment key={row.label}>
            <TextLine text={row.label} left={10} top={cy} size={labelSize} color={palette.secondary} align="start" maxWidth={width * 0.34} weight="label" sizing="fit" />
            <TextLine text={row.value} left={width - 10} top={cy} size={valueSize} color={row.color} align="end" maxWidth={width * 0.6} weight="value" />
          </React.Fragment>
        )
      })}
    </>
  )
}

function DeltaWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  if (frame.lap.targetLapTime <= 0) {
    return <TextLine text="NO TARGET" left={width / 2} top={height / 2} size={height * 0.4} color={palette.muted} align="center" maxWidth={width * 0.9} weight="label" sizing="fit" />
  }

  const color = frame.lap.delta < -0.0005 ? palette.timingPersonalBest : palette.neutral
  return (
    <>
      <TextLine text="DELTA" left={10} top={height / 2} size={height * 0.24} color={palette.muted} align="start" maxWidth={width * 0.2} weight="label" sizing="fit" />
      <TextLine text={formatDelta(frame.lap.delta)} left={width - 10} top={height / 2} size={height * 0.42} color={color} align="end" maxWidth={width * 0.34} weight="value" />
      <DeltaBar x={width * 0.25} y={height / 2 - height * 0.1} w={width * 0.3} h={height * 0.2} delta={frame.lap.delta} palette={palette} />
    </>
  )
}

function FuelWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const fuel = frame.car.fuel
  const perLap = frame.car.fuelPerLap
  const tint = fuel > 0 && fuel < 5 ? withAlpha(fuel < 2 ? palette.critical : palette.warning, fuel < 2 ? 51 / 255 : 31 / 255) : null
  const tintLayer = tint ? <div style={{ position: 'absolute', inset: 0, background: tint }} /> : null

  if (height < 150 && width < 200) {
    return (
      <>
        {tintLayer}
        <TextLine text="FUEL" left={8} top={height * 0.2} size={height * 0.12} color={palette.muted} align="start" maxWidth={width * 0.35} weight="label" sizing="fit" />
        <TextLine text={`${formatFuelPerLap(perLap)} L/lap`} left={width - 8} top={height * 0.2} size={height * 0.11} color={palette.secondary} align="end" maxWidth={width * 0.58} weight="label" />
        <TextLine text={`${formatFuel(fuel)} L`} left={width / 2} top={height * 0.63} size={height * 0.34} color={palette.foreground} align="center" maxWidth={width * 0.9} weight="value" />
      </>
    )
  }

  const laps = perLap > 0.01 ? `~${formatInt(fuel / perLap)} laps` : '~-- laps'
  return (
    <>
      {tintLayer}
      <TextLine text="FUEL" left={10} top={height * 0.16} size={height * 0.12} color={palette.muted} align="start" maxWidth={width} weight="label" sizing="fit" />
      <TextLine text={`${formatFuel(fuel)} L`} left={10} top={height * 0.52} size={height * 0.34} color={palette.foreground} align="start" maxWidth={width * 0.6} weight="value" />
      <TextLine text={`${formatFuelPerLap(perLap)} L/lap`} left={width - 10} top={height * 0.3} size={height * 0.18} color={palette.secondary} align="end" maxWidth={width * 0.55} weight="value" />
      <TextLine text={laps} left={width - 10} top={height * 0.78} size={height * 0.16} color={palette.muted} align="end" maxWidth={width * 0.55} weight="label" />
    </>
  )
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

function TyreTempWidget({ widget, frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const useCore = configString(widget.config, 'channel') === 'core'
  const cellW = width / 2
  const cellH = (height - height * 0.18) / 2
  const gridTop = height * 0.18
  return (
    <>
      <TextLine text={useCore ? 'TYRE CORE' : 'TYRE TEMPS'} left={10} top={height * 0.12} size={height * 0.1} color={palette.muted} align="start" maxWidth={width} weight="label" sizing="fit" />
      {TIRE_CORNERS.map((corner, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const cx = col * cellW
        const cy = gridTop + row * cellH
        const temp = tyreTemperature(frame.tires[corner.position], useCore)
        const text = temp > 0 ? `${formatTemp(temp)}°` : '--'
        return (
          <React.Fragment key={corner.label}>
            <TextLine text={corner.label} left={cx + 8} top={cy + cellH * 0.4} size={cellH * 0.26} color={palette.muted} align="start" maxWidth={cellW * 0.4} weight="label" sizing="fit" />
            <TextLine text={text} left={cx + cellW - 8} top={cy + cellH * 0.5} size={cellH * 0.42} color={resolveTyreColor(temp, palette)} align="end" maxWidth={cellW * 0.7} weight="value" />
          </React.Fragment>
        )
      })}
    </>
  )
}

function TyrePressureWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const cellW = width / 2
  const cellH = (height - height * 0.18) / 2
  const gridTop = height * 0.18
  return (
    <>
      <TextLine text="TYRE PRESSURE" left={10} top={height * 0.12} size={height * 0.1} color={palette.muted} align="start" maxWidth={width} weight="label" sizing="fit" />
      {TIRE_CORNERS.map((corner, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const cx = col * cellW
        const cy = gridTop + row * cellH
        const tire = frame.tires[corner.position]
        return (
          <React.Fragment key={corner.label}>
            <TextLine text={corner.label} left={cx + 8} top={cy + cellH * 0.28} size={cellH * 0.2} color={palette.muted} align="start" maxWidth={cellW * 0.4} weight="label" sizing="fit" />
            <TextLine text={formatPressure(tire.pressureKPa)} left={cx + cellW - 8} top={cy + cellH * 0.66} size={cellH * 0.34} color={palette.foreground} align="end" maxWidth={cellW * 0.82} weight="value" />
          </React.Fragment>
        )
      })}
    </>
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
  return (
    <>
      <TextLine text="TC1" left={6} top={height * 0.2} size={height * 0.16} color={palette.muted} align="start" maxWidth={width * 0.6} weight="label" sizing="fit" />
      <TextLine text={String(Math.trunc(frame.electronics.tc))} left={width / 2} top={height * 0.58} size={height * 0.5} color={color} align="center" maxWidth={width * 0.9} weight="value" />
    </>
  )
}

function AbsWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  return <SimpleValue width={width} height={height} label="ABS" value={String(Math.trunc(frame.electronics.abs))} palette={palette} />
}

function EngineMapWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  return <SimpleValue width={width} height={height} label="MAP" value={String(Math.trunc(frame.electronics.motorMap))} palette={palette} />
}

function BrakeBiasWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  // Discrepancy carried from bindings.ts: CarState.brakeBiasRear is a 0-1 fraction here, a
  // percentage in the desktop model, so it is scaled to keep this widget's display consistent
  // with the "car.brakeBiasRear" text binding.
  return <SimpleValue width={width} height={height} label="BRAKE BIAS" value={`${(frame.car.brakeBiasRear * 100).toFixed(1)}%`} palette={palette} />
}

function FuelTargetWidget({ targets, palette, width, height }: WidgetContentProps): React.ReactElement {
  return <SimpleValue width={width} height={height} label="FUEL TARGET" value={`${formatFuelPerLapTarget(targets?.fuelPerLapLiters ?? null)} L/lap`} palette={palette} />
}

function PositionWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const value = frame.race.totalPositions > 0 ? `P${frame.race.position} / ${frame.race.totalPositions}` : frame.race.position > 0 ? `P${frame.race.position}` : 'P--'
  return <SimpleValue width={width} height={height} label="POSITION" value={value} palette={palette} />
}

function GapsWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  const ahead = formatGap(frame.race.gapAhead)
  const behind = formatGap(frame.race.gapBehind)
  return (
    <>
      <TextLine text="GAPS" left={8} top={height * 0.16} size={height * 0.12} color={palette.muted} align="start" maxWidth={width} weight="label" sizing="fit" />
      <TextLine text="AHEAD" left={10} top={height * 0.5} size={height * 0.13} color={palette.secondary} align="start" maxWidth={width * 0.45} weight="label" sizing="fit" />
      <TextLine text={ahead === '--' ? '--' : `-${ahead}`} left={10} top={height * 0.78} size={height * 0.2} color={palette.foreground} align="start" maxWidth={width * 0.45} weight="value" />
      <TextLine text="BEHIND" left={width - 10} top={height * 0.5} size={height * 0.13} color={palette.secondary} align="end" maxWidth={width * 0.45} weight="label" sizing="fit" />
      <TextLine text={behind === '--' ? '--' : `+${behind}`} left={width - 10} top={height * 0.78} size={height * 0.2} color={palette.foreground} align="end" maxWidth={width * 0.45} weight="value" />
    </>
  )
}

function PredictiveLapWidget({ frame, palette, width, height }: WidgetContentProps): React.ReactElement {
  return <SimpleValue width={width} height={height} label="PREDICTED" value={formatLap(frame.lap.targetLapTime)} palette={palette} />
}

function VirtualEnergyPercent({ pct, palette, width, height }: { pct: number; palette: DashPaletteColors; width: number; height: number }): React.ReactElement {
  const barColor = pct < 5 ? palette.critical : pct < 15 ? palette.warning : palette.neutral
  return (
    <>
      <TextLine text="VIRTUAL ENERGY" left={8} top={height * 0.18} size={height * 0.13} color={palette.muted} align="start" maxWidth={width * 0.9} weight="label" sizing="fit" />
      <TextLine text={pct > 0 ? `${pct.toFixed(0)}%` : '--'} left={width / 2} top={height * 0.58} size={height * 0.4} color={palette.neutral} align="center" maxWidth={width * 0.9} weight="value" />
      <HBar x={width * 0.08} y={height - height * 0.16} w={width * 0.84} h={height * 0.08} pct={pct / 100} color={barColor} centered={false} />
    </>
  )
}

function VirtualEnergyPower({ pct, frame, palette, width, height }: { pct: number; frame: TelemetryFrame; palette: DashPaletteColors; width: number; height: number }): React.ReactElement {
  const deploy = frame.energy.deployPower
  const regen = frame.energy.regenPower
  return (
    <>
      <TextLine text="VIRTUAL ENERGY" left={8} top={height * 0.2} size={height * 0.14} color={palette.muted} align="start" maxWidth={width * 0.9} weight="label" sizing="fit" />
      <TextLine text={pct > 0 ? `${pct.toFixed(0)}%` : '--'} left={8} top={height * 0.62} size={height * 0.38} color={palette.neutral} align="start" maxWidth={width * 0.6} weight="value" />
      <TextLine text={deploy > 0 ? `DEP ${formatInt(deploy)} kW` : 'DEP -- kW'} left={width - 8} top={height * 0.42} size={height * 0.15} color={palette.secondary} align="end" maxWidth={width * 0.55} weight="value" />
      <TextLine text={regen > 0 ? `REGEN ${formatInt(regen)} kW` : 'REGEN -- kW'} left={width - 8} top={height * 0.82} size={height * 0.15} color={palette.secondary} align="end" maxWidth={width * 0.6} weight="value" />
    </>
  )
}

function VirtualEnergyBudget({
  pct,
  perLapPct,
  rawLevel,
  rawPerLap,
  palette,
  width,
  height,
}: {
  pct: number
  perLapPct: number
  rawLevel: number
  rawPerLap: number
  palette: DashPaletteColors
  width: number
  height: number
}): React.ReactElement {
  const laps = rawPerLap > 0.0001 ? `~${formatInt(rawLevel / rawPerLap)} laps` : '~-- laps'
  const perLapText = perLapPct > 0.0001 ? `${perLapPct.toFixed(1)} %/lap` : '-- %/lap'

  if (height < 150 && width < 200) {
    return (
      <>
        <TextLine text="V-ENERGY" left={8} top={height * 0.2} size={height * 0.12} color={palette.muted} align="start" maxWidth={width * 0.4} weight="label" sizing="fit" />
        <TextLine text={perLapText} left={width - 8} top={height * 0.2} size={height * 0.11} color={palette.secondary} align="end" maxWidth={width * 0.55} weight="label" />
        <TextLine text={pct > 0 ? `${pct.toFixed(0)}%` : '--'} left={width / 2} top={height * 0.63} size={height * 0.34} color={palette.neutral} align="center" maxWidth={width * 0.9} weight="value" />
      </>
    )
  }

  return (
    <>
      <TextLine text="VIRTUAL ENERGY" left={10} top={height * 0.16} size={height * 0.12} color={palette.muted} align="start" maxWidth={width} weight="label" sizing="fit" />
      <TextLine text={pct > 0 ? `${pct.toFixed(0)}%` : '--'} left={10} top={height * 0.52} size={height * 0.34} color={palette.neutral} align="start" maxWidth={width * 0.6} weight="value" />
      <TextLine text={perLapText} left={width - 10} top={height * 0.3} size={height * 0.18} color={palette.secondary} align="end" maxWidth={width * 0.55} weight="value" />
      <TextLine text={laps} left={width - 10} top={height * 0.78} size={height * 0.16} color={palette.muted} align="end" maxWidth={width * 0.55} weight="label" />
    </>
  )
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
  const tint = pct > 0 && pct < 15 ? withAlpha(pct < 5 ? palette.critical : palette.warning, pct < 5 ? 51 / 255 : 31 / 255) : null

  return (
    <>
      {tint && <div style={{ position: 'absolute', inset: 0, background: tint }} />}
      {mode === 'percent' ? (
        <VirtualEnergyPercent pct={pct} palette={palette} width={width} height={height} />
      ) : mode === 'power' ? (
        <VirtualEnergyPower pct={pct} frame={frame} palette={palette} width={width} height={height} />
      ) : (
        <VirtualEnergyBudget pct={pct} perLapPct={frame.energy.virtualEnergyPerLap * scale} rawLevel={raw} rawPerLap={frame.energy.virtualEnergyPerLap} palette={palette} width={width} height={height} />
      )}
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
