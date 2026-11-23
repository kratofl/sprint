import { previewFrame } from '@sprint/dashboard'
import type { ColourTheme, DashColourLimits, DashLayout, DashUnits, DashWidget } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import type { Heat } from '../colours'
import type { TyreCorner } from '../pitwall/pitWallData'

/**
 * Settings › Colours (`colours.ts` has the setting itself): the rows of limits with their steps,
 * which keep each mark in its range and order as `RuntimeCoordinator.UpdateColours` checks them,
 * and the preview that shows the scale on the wheel and on the pit wall.
 */

/** Each theme's one-line promise, as the Settings select's detail shows it. */
export const THEME_DETAIL: Record<ColourTheme, string> = {
  Sprint: 'Cold blue, good green, warm amber, hot red',
  Calm: 'Colour only when something is off',
  Strict: 'Outside the window is red',
}

type LimitKey = keyof DashColourLimits

/** One mark between two states: the limit it sets, the state it starts and its words. */
export type ColourMark = { key: LimitKey; heat: Exclude<Heat, 'ok'>; label: string }

/** One row of "When colours change": a measured value and its marks, coldest first. */
export type ColourLimitRow = { id: string; label: string; detail: string; marks: readonly ColourMark[] }

export const COLOUR_LIMIT_ROWS: readonly ColourLimitRow[] = [
  {
    id: 'tyre',
    label: 'Tyre temperature',
    detail: 'Against the compound’s ideal',
    marks: [
      { key: 'tyreColdBelow', heat: 'cold', label: 'Cold under' },
      { key: 'tyreWarmAbove', heat: 'warm', label: 'Warm over' },
      { key: 'tyreHotAbove', heat: 'hot', label: 'Hot over' },
    ],
  },
  {
    id: 'brake',
    label: 'Brake temperature',
    detail: 'Discs',
    marks: [
      { key: 'brakeColdBelow', heat: 'cold', label: 'Cold under' },
      { key: 'brakeWarmAbove', heat: 'warm', label: 'Warm over' },
      { key: 'brakeHotAbove', heat: 'hot', label: 'Hot over' },
    ],
  },
  {
    id: 'wear',
    label: 'Tyre wear',
    detail: 'Tread left',
    marks: [
      { key: 'wearLowBelow', heat: 'warm', label: 'Low under' },
      { key: 'wearCriticalBelow', heat: 'hot', label: 'Critical under' },
    ],
  },
  {
    id: 'energy',
    label: 'Fuel and energy',
    detail: 'Fuel, battery and virtual-energy bars',
    marks: [
      { key: 'energyLowBelow', heat: 'warm', label: 'Low under' },
      { key: 'energyCriticalBelow', heat: 'hot', label: 'Critical under' },
    ],
  },
]

/** Each limit's range and step (`ColourLimits.Fields` in Core holds the same ranges). */
const RANGE: Record<LimitKey, { min: number; max: number; step: number }> = {
  tyreColdBelow: { min: 1, max: 40, step: 1 },
  tyreWarmAbove: { min: 1, max: 40, step: 1 },
  tyreHotAbove: { min: 2, max: 60, step: 1 },
  brakeColdBelow: { min: 50, max: 800, step: 25 },
  brakeWarmAbove: { min: 100, max: 1100, step: 25 },
  brakeHotAbove: { min: 150, max: 1200, step: 25 },
  wearLowBelow: { min: 5, max: 95, step: 5 },
  wearCriticalBelow: { min: 1, max: 90, step: 5 },
  energyLowBelow: { min: 5, max: 95, step: 5 },
  energyCriticalBelow: { min: 1, max: 90, step: 5 },
}

/** The marks keep their order, as `ColourLimits.Problem` in Core requires. */
const inOrder = (l: DashColourLimits): boolean =>
  l.tyreHotAbove > l.tyreWarmAbove &&
  l.brakeWarmAbove > l.brakeColdBelow &&
  l.brakeHotAbove > l.brakeWarmAbove &&
  l.wearCriticalBelow < l.wearLowBelow &&
  l.energyCriticalBelow < l.energyLowBelow

/** The limit one step down or up, or null where that leaves its range or crosses its neighbour. */
export function stepColourLimit(limits: DashColourLimits, key: LimitKey, step: -1 | 1): number | null {
  const { min, max, step: size } = RANGE[key]
  const next = limits[key] + step * size
  if (next < min || next > max) return null
  return inOrder({ ...limits, [key]: next }) ? next : null
}

/** A temperature difference in the driver's units, signed: "−10°", "+18°". */
const signedDegrees = (celsius: number, units: DashUnits): string => {
  const shown = Math.round(units === 'Imperial' ? celsius * 1.8 : celsius)
  return `${shown < 0 ? '−' : '+'}${Math.abs(shown)}°`
}

/** A limit as its stepper shows it: "ideal −10°" for tyres, "300°" (572° in °F) for brakes, "60 %". */
export function colourLimitText(key: LimitKey, value: number, units: DashUnits): string {
  switch (key) {
    case 'tyreColdBelow':
      return `ideal ${signedDegrees(-value, units)}`
    case 'tyreWarmAbove':
    case 'tyreHotAbove':
      return `ideal ${signedDegrees(value, units)}`
    case 'brakeColdBelow':
    case 'brakeWarmAbove':
    case 'brakeHotAbove':
      return `${Math.round(units === 'Imperial' ? value * 1.8 + 32 : value)}°`
    default:
      return `${value} %`
  }
}

// ── The preview: the same four tyres on the wheel and on the pit wall ────

/** Front left cold, front right good, rear left warm, rear right hot, against an 85° ideal; brakes likewise. */
const PREVIEW_TEMPS = [70, 87, 100, 110] as const
const PREVIEW_BRAKES = [250, 480, 700, 850] as const
const PREVIEW_IDEAL = 85

const widget = (id: string, type: string, col: number, row: number, colSpan: number, rowSpan: number): DashWidget => ({ id, type, col, row, colSpan, rowSpan })

/** A small dash that shows the scale: the tyre and brake corners, fuel laps, tyre wear and the delta. */
export const COLOUR_PREVIEW_LAYOUT: DashLayout = {
  id: 'colour-preview',
  name: 'Colours',
  mode: 'advanced',
  gridCols: 20,
  gridRows: 12,
  screenProfile: 'landscape-800x480',
  alerts: [],
  pages: [
    {
      id: 'preview',
      name: 'Preview',
      widgets: [
        widget('tyres', 'tyre_temp', 0, 0, 10, 7),
        widget('brakes', 'brake_temp', 10, 0, 10, 7),
        widget('fuel', 'fuel_laps', 0, 7, 7, 5),
        widget('wear', 'tyre_wear', 7, 7, 6, 5),
        widget('delta', 'delta', 13, 7, 7, 5),
      ],
    },
  ],
}

export const COLOUR_PREVIEW_FRAME: TelemetryFrame = (() => {
  const frame = previewFrame('mid_lap')
  const tyre = (i: 0 | 1 | 2 | 3) => {
    const celsius = PREVIEW_TEMPS[i]
    return { ...frame.tires[i], optimalTemp: PREVIEW_IDEAL, tempInner: celsius, tempMiddle: celsius, tempOuter: celsius, tempSurface: celsius, brakeTemp: PREVIEW_BRAKES[i], wearPercent: 46 }
  }
  return { ...frame, tires: [tyre(0), tyre(1), tyre(2), tyre(3)], car: { ...frame.car, fuel: 9, fuelPerLap: 2.6 } }
})()

/** The same four tyres as the pit wall's Tyres tile draws them. */
export const COLOUR_PREVIEW_TYRES: readonly TyreCorner[] = (['FrontLeft', 'FrontRight', 'RearLeft', 'RearRight'] as const).map((position, i) => {
  const celsius = PREVIEW_TEMPS[i] ?? PREVIEW_IDEAL
  return {
    position,
    inner: celsius,
    middle: celsius,
    outer: celsius,
    core: celsius,
    brake: PREVIEW_BRAKES[i] ?? 0,
    pressureKPa: 168,
    wearPercent: 46,
    compound: 'Medium',
    optimalTemp: PREVIEW_IDEAL,
  }
})
