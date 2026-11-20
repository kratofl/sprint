import {
  ENGINE_LIMIT_MAX, ENGINE_LIMIT_MIN, FUEL_LAPS_LEFT_MAX, FUEL_LAPS_LEFT_MIN, LAUNCH_RANGES, LIFT_POINT_MAX, LIFT_POINT_MIN, MIN_ALERT_SECONDS,
  dashAlertFromSettings, maxAlertSeconds,
} from '@sprint/dashboard'
import type { DashAlertSettings, DashAlertSize, DashAlertType, DashLaunchWindow, DashLayout, DashUnits } from '@sprint/dashboard'
import type { ButtonState, SprintCommand } from '../bridge'
import { layoutScreenProfile } from './DashesDomain'
import { deviceHasScreen, logicalSize, type Device } from './DevicesDomain'

// Dashes > Settings (DashSettings.tsx): the alerts every dash shows, and the Ack button that takes
// them down. The settings themselves are the host's (`dashAlerts` in the state, changed with
// `dashAlerts.update`); this file words them, groups them, and stamps them onto a dash the way the
// host does before a renderer draws it.

/** The app-wide button function that takes the alert down on every dash, bound per device (host: `SprintCommands.Acknowledge`). */
export const ACK_FUNCTION = 'acknowledge'

/** Each alert as the driver knows it: its name, and a line on when it shows. */
export const ALERT_COPY: Record<DashAlertType, { label: string; when: string }> = {
  tc_change: { label: 'Traction control', when: 'TC, slip and cut' },
  abs_change: { label: 'ABS', when: 'The ABS level' },
  bias_change: { label: 'Brake bias', when: 'The front share of the braking' },
  enginemap_change: { label: 'Engine map', when: 'The engine map step' },
  migration_change: { label: 'Brake migration', when: 'The migration step' },
  arb_change: { label: 'Anti-roll bars', when: 'Front and rear bars' },
  dial_change: { label: 'Wheel dial', when: 'Turning the multi-position dial' },
  pit_limiter: { label: 'Pit limiter', when: 'While the limiter is on. Each dash picks how it looks, in its designer.' },
  launch: { label: 'Launch', when: 'Standing with the clutch in: LAUNCH and the revs, green inside your window' },
  engine_warning: { label: 'Engine overheating', when: 'At your water or oil limit, or when the game reports overheating' },
  damage: { label: 'Damage', when: 'After a hit that damages the car' },
  flag: { label: 'Flags', when: 'Yellow, blue, safety car, VSC and red. Then a thin bar across the top while it is out; Ack hides it.' },
  penalty: { label: 'Penalties', when: 'A new penalty to serve' },
  fuel_low: { label: 'Fuel warning', when: 'Low fuel, once a stint, at the second level' },
  pit_now: { label: 'Pit now', when: 'On the last quarter of the lap when the fuel or energy will not last another lap' },
  lift_now: { label: 'Lift now', when: "While the game's lift-and-coast cue is past your lift point" },
  lap_summary: { label: 'Lap review', when: 'After each timed lap. Each dash picks what it shows, in its designer.' },
}

/** The page's lists of alerts, top to bottom, after Acknowledge. Every alert type is in exactly one. */
export const ALERT_GROUPS: ReadonlyArray<{ title: string; footer?: string; types: readonly DashAlertType[] }> = [
  { title: 'Fuel and laps', types: ['fuel_low', 'pit_now', 'lift_now', 'lap_summary'] },
  {
    title: 'Setting changes',
    footer: 'Shown when you change the setting while driving.',
    types: ['tc_change', 'abs_change', 'bias_change', 'enginemap_change', 'migration_change', 'arb_change', 'dial_change'],
  },
  { title: 'Car', types: ['pit_limiter', 'launch', 'engine_warning', 'damage'] },
  { title: 'Race control', types: ['flag', 'penalty'] },
]

/**
 * The lap review always fills the screen in its own colours, and the pit limiter is each dash's
 * own overlay (its designer's Pit limiter section), so neither has a size or colours to set here.
 */
export const hasLook = (type: DashAlertType): boolean => type !== 'lap_summary' && type !== 'pit_limiter'

/** The pit limiter shows exactly while the limiter is on, so it has no duration; every other alert has one. */
export const isTimed = (type: DashAlertType): boolean => type !== 'pit_limiter'

/** The alerts that follow the car while they are up (the launch revs, the laps left) and go when it no longer holds. */
export const isLive = (type: DashAlertType): boolean => type === 'launch' || type === 'pit_now' || type === 'lift_now'

export const sizeText = (size: DashAlertSize): string => (size === 'full' ? 'Full screen' : 'Strip')

const secondsText = (seconds: number): string => `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`

export const durationText = (alert: Pick<DashAlertSettings, 'untilAck' | 'durationSeconds'>): string => (alert.untilAck ? 'Until Ack' : secondsText(alert.durationSeconds))

export const lapsLeftText = (laps: number): string => (laps === 1 ? '1 lap' : `${laps} laps`)

/** An alert row's one line: "Off", "On", "Strip · 3 s", "Full screen · Until Ack · Inverted", "4 and 2 laps left · Strip · Until Ack". */
export function alertSummary(alert: DashAlertSettings): string {
  if (!alert.enabled) return 'Off'
  const parts = [
    alert.type === 'fuel_low' ? `${alert.warningLapsLeft} and ${lapsLeftText(alert.lapsLeft)} left` : null,
    hasLook(alert.type) ? sizeText(alert.size) : null,
    isTimed(alert.type) ? durationText(alert) : null,
    hasLook(alert.type) && alert.invertColors ? 'Inverted' : null,
  ].filter((part) => part !== null)
  return parts.length > 0 ? parts.join(' · ') : 'On'
}

/**
 * The duration slider's range: whole seconds from the shortest to the type's longest, then one
 * more step, "Until Ack".
 */
export const durationRange = (type: DashAlertType): { min: number; max: number } => ({ min: MIN_ALERT_SECONDS, max: maxAlertSeconds(type) + 1 })

/** Where the slider sits for an alert's settings. */
export function durationStep(alert: DashAlertSettings): number {
  const { min, max } = durationRange(alert.type)
  return alert.untilAck ? max : Math.min(max - 1, Math.max(min, Math.round(alert.durationSeconds)))
}

/** What a slider step sets: its last step is "Until Ack", which keeps the seconds for later. */
export function durationAtStep(type: DashAlertType, step: number): { untilAck: true } | { untilAck: false; durationSeconds: number } {
  const { min, max } = durationRange(type)
  return step >= max ? { untilAck: true } : { untilAck: false, durationSeconds: Math.max(min, Math.round(step)) }
}

/** The slider's own words for a step, for its value text and screen readers. */
export const durationStepText = (type: DashAlertType, step: number): string => {
  const at = durationAtStep(type, step)
  return at.untilAck ? 'Until Ack' : secondsText(at.durationSeconds)
}

/** What a change to one alert sends; only the fields given change. */
export type AlertChange = {
  enabled?: boolean
  size?: DashAlertSize
  invertColors?: boolean
  durationSeconds?: number
  untilAck?: boolean
  lapsLeft?: number
  warningLapsLeft?: number
  waterLimitCelsius?: number
  oilLimitCelsius?: number
  liftPoint?: number
} & Partial<DashLaunchWindow>

export const buildAlertUpdate = (type: DashAlertType, change: AlertChange): SprintCommand => ({ type: 'dashAlerts.update', alertType: type, ...change })

/** `value` moved `step` times `by`, or null past `min`..`max`. */
export function stepWithin(value: number, step: -1 | 1, by: number, min: number, max: number): number | null {
  const next = value + step * by
  return next < min || next > max ? null : next
}

/**
 * One of the fuel warning's levels one lap down or up, or null at the end of its range. The first
 * (amber) level never goes under the second (LOW FUEL), so pass the other level as the bound:
 * `stepLapsLeft(warning, -1, lapsLeft)` and `stepLapsLeft(lapsLeft, 1, FUEL_LAPS_LEFT_MIN, warning)`.
 */
export const stepLapsLeft = (laps: number, step: -1 | 1, min = FUEL_LAPS_LEFT_MIN, max = FUEL_LAPS_LEFT_MAX): number | null => stepWithin(laps, step, 1, min, max)

/** How far one press moves an engine limit, °C. */
export const ENGINE_LIMIT_STEP = 5

/** An engine limit one step down or up, or null past the end of its range. */
export const stepEngineLimit = (celsius: number, step: -1 | 1): number | null => stepWithin(celsius, step, ENGINE_LIMIT_STEP, ENGINE_LIMIT_MIN, ENGINE_LIMIT_MAX)

/** How far one press moves each launch setting (the speed moves a whole km/h or mph, `stepLaunchSpeed`). */
export const LAUNCH_STEPS: Readonly<Record<Exclude<keyof DashLaunchWindow, 'speedKmh'>, number>> = { clutchPercent: 5, rpmFrom: 100, rpmTo: 100, throttleFrom: 5, throttleTo: 5 }

/**
 * A launch setting one step down or up within its range, or null at its end. A window's ends never
 * cross: its from stops at its to and its to at its from.
 */
export function stepLaunch(window: DashLaunchWindow, key: Exclude<keyof DashLaunchWindow, 'speedKmh'>, step: -1 | 1): number | null {
  const { min, max } = LAUNCH_RANGES[key]
  const bound: Partial<Record<keyof DashLaunchWindow, { min?: number; max?: number }>> = {
    rpmFrom: { max: window.rpmTo },
    rpmTo: { min: window.rpmFrom },
    throttleFrom: { max: window.throttleTo },
    throttleTo: { min: window.throttleFrom },
  }
  return stepWithin(window[key], step, LAUNCH_STEPS[key], bound[key]?.min ?? min, bound[key]?.max ?? max)
}

const KM_PER_MILE = 1.609344

/** The launch speed in the driver's units: "10 km/h", "6 mph" (stored in whole km/h). */
export const launchSpeedText = (kmh: number, units: DashUnits): string => (units === 'Imperial' ? `${Math.round(kmh / KM_PER_MILE)} mph` : `${kmh} km/h`)

/** The launch speed one km/h, or one mph for an imperial driver, down or up, in whole km/h; null at the end of its range. */
export function stepLaunchSpeed(kmh: number, step: -1 | 1, units: DashUnits): number | null {
  const { min, max } = LAUNCH_RANGES.speedKmh
  if (units === 'Metric') return stepWithin(kmh, step, 1, min, max)
  const next = Math.round((Math.round(kmh / KM_PER_MILE) + step) * KM_PER_MILE)
  return next < min || next > max ? null : next
}

/** How far one press moves the lift point on the game's 0–255 cue. */
export const LIFT_POINT_STEP = 5

export const stepLiftPoint = (point: number, step: -1 | 1): number | null => stepWithin(point, step, LIFT_POINT_STEP, LIFT_POINT_MIN, LIFT_POINT_MAX)

/** An engine limit in the driver's units: "110 °C", "230 °F". */
export const engineLimitText = (celsius: number, units: DashUnits): string =>
  units === 'Imperial' ? `${Math.round(celsius * 1.8 + 32)} °F` : `${celsius} °C`

export const percentText = (percent: number): string => `${percent} %`

export const rpmText = (rpm: number): string => `${rpm} rpm`

/** How long the preview shows an alert: its duration, or a few seconds for one held until Ack. */
export const UNTIL_ACK_PREVIEW_SECONDS = 3

export const previewSeconds = (alert: DashAlertSettings): number => (alert.untilAck ? UNTIL_ACK_PREVIEW_SECONDS : alert.durationSeconds)

/**
 * The dash with the app-wide alerts on it, as the host hands it to a renderer (`AppDashAlerts.Stamp`):
 * a copy whose alerts are the settings and whose own alert look is gone. Never saved.
 */
export const stampDashAlerts = (layout: DashLayout, alerts: readonly DashAlertSettings[]): DashLayout => ({ ...layout, alerts: alerts.map(dashAlertFromSettings), alertConfig: undefined })

/** The dash the preview plays alerts on, at the size it is drawn at, and the device it is on (null: none shows it). */
export type PreviewDash = { layout: DashLayout; size: { width: number; height: number }; deviceName: string | null }

/** The dash of the first device showing a dash, at that screen's size; otherwise the first dash at its own. */
export function previewDash(devices: readonly Device[], layouts: readonly DashLayout[]): PreviewDash | null {
  for (const device of devices) {
    if (device.purpose !== 'dash' || !deviceHasScreen(device)) continue
    const layout = layouts.find((candidate) => candidate.id === device.dashId)
    if (layout) return { layout, size: logicalSize(device), deviceName: device.name }
  }
  const first = layouts[0]
  if (!first) return null
  const profile = layoutScreenProfile(first)
  return { layout: first, size: { width: profile.width, height: profile.height }, deviceName: null }
}

/** One device's row under Acknowledge: the button bound to Ack, if any, and whether it is waiting for one. */
export type AckRow = { deviceId: string; name: string; input: string | null; waiting: boolean }

/** Every device whose buttons can run Ack (the host offers it on each with buttons). */
export const ackRows = (devices: readonly Device[], buttons: ButtonState): AckRow[] =>
  devices
    .filter((device) => device.type !== 'screen' && (buttons.functions[device.id] ?? []).some((fn) => fn.id === ACK_FUNCTION))
    .map((device) => ({
      deviceId: device.id,
      name: device.name,
      input: device.bindings.find((binding) => binding.command === ACK_FUNCTION)?.input ?? null,
      waiting: buttons.listening?.deviceId === device.id && buttons.listening.command === ACK_FUNCTION,
    }))

/** The Controls tab's line on the dial popup, where its look moved to. */
export const dialPopupHint = (dial: DashAlertSettings): string =>
  dial.enabled ? 'Its size, colours and how long it stays are set with the other alerts on Dashes › Settings.' : 'The popup is off. Turn it on with the other alerts on Dashes › Settings.'
