import { FUEL_LAPS_LEFT_MAX, FUEL_LAPS_LEFT_MIN, MIN_ALERT_SECONDS, dashAlertFromSettings, maxAlertSeconds } from '@sprint/dashboard'
import type { DashAlertSettings, DashAlertSize, DashAlertType, DashLayout } from '@sprint/dashboard'
import type { ButtonState, SprintCommand } from '../bridge'
import { layoutScreenProfile } from './DashesDomain'
import { deviceHasScreen, logicalSize, type Device } from './DevicesDomain'

// Dashes > Settings (DashSettings.tsx): the alerts every dash shows, and the Ack button that takes
// them down. The settings themselves are the host's (`dashAlerts` in the state, changed with
// `dashAlerts.update`); this file words them, groups them, and stamps them onto a dash the way the
// host does before a renderer draws it.

/** The wheel button function that takes the alert down on every dash (host: `SprintCommands.DashAcknowledge`). */
export const ACK_FUNCTION = 'dash.acknowledge'

/** Each alert as the driver knows it: its name, and a line on when it shows. */
export const ALERT_COPY: Record<DashAlertType, { label: string; when: string }> = {
  tc_change: { label: 'Traction control', when: 'TC, slip and cut' },
  abs_change: { label: 'ABS', when: 'The ABS level' },
  bias_change: { label: 'Brake bias', when: 'The front share of the braking' },
  enginemap_change: { label: 'Engine map', when: 'The engine map step' },
  migration_change: { label: 'Brake migration', when: 'The migration step' },
  arb_change: { label: 'Anti-roll bars', when: 'Front and rear bars' },
  dial_change: { label: 'Wheel dial', when: 'Turning the multi-position dial' },
  pit_limiter: { label: 'Pit limiter', when: 'While the limiter is on' },
  engine_warning: { label: 'Engine overheating', when: 'When the engine starts to overheat' },
  damage: { label: 'Damage', when: 'After a hit that damages the car' },
  flag: { label: 'Flags', when: 'Yellow, blue, safety car, VSC and red' },
  penalty: { label: 'Penalties', when: 'A new penalty to serve' },
  fuel_low: { label: 'Fuel warning', when: 'Once a stint, when the fuel runs low' },
  lap_summary: { label: 'Lap review', when: 'After each timed lap' },
}

/** The page's lists of alerts, top to bottom, after Acknowledge. Every alert type is in exactly one. */
export const ALERT_GROUPS: ReadonlyArray<{ title: string; footer?: string; types: readonly DashAlertType[] }> = [
  { title: 'Fuel and laps', types: ['fuel_low', 'lap_summary'] },
  {
    title: 'Setting changes',
    footer: 'Shown when you change the setting while driving.',
    types: ['tc_change', 'abs_change', 'bias_change', 'enginemap_change', 'migration_change', 'arb_change', 'dial_change'],
  },
  { title: 'Car', types: ['pit_limiter', 'engine_warning', 'damage'] },
  { title: 'Race control', types: ['flag', 'penalty'] },
]

/** The lap review always fills the screen in its own colours, so it has no size or colours to set. */
export const hasLook = (type: DashAlertType): boolean => type !== 'lap_summary'

export const sizeText = (size: DashAlertSize): string => (size === 'full' ? 'Full screen' : 'Strip')

const secondsText = (seconds: number): string => `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`

export const durationText = (alert: Pick<DashAlertSettings, 'untilAck' | 'durationSeconds'>): string => (alert.untilAck ? 'Until Ack' : secondsText(alert.durationSeconds))

export const lapsLeftText = (laps: number): string => (laps === 1 ? '1 lap' : `${laps} laps`)

/** An alert row's one line: "Off", "Strip · 3 s", "Full screen · Until Ack · Inverted", "2 laps left · Strip · Until Ack". */
export function alertSummary(alert: DashAlertSettings): string {
  if (!alert.enabled) return 'Off'
  const parts = [
    alert.type === 'fuel_low' ? `${lapsLeftText(alert.lapsLeft)} left` : null,
    hasLook(alert.type) ? sizeText(alert.size) : null,
    durationText(alert),
    hasLook(alert.type) && alert.invertColors ? 'Inverted' : null,
  ]
  return parts.filter((part) => part !== null).join(' · ')
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
export type AlertChange = { enabled?: boolean; size?: DashAlertSize; invertColors?: boolean; durationSeconds?: number; untilAck?: boolean; lapsLeft?: number }

export const buildAlertUpdate = (type: DashAlertType, change: AlertChange): SprintCommand => ({ type: 'dashAlerts.update', alertType: type, ...change })

/** The fuel warning's laps-left mark one step down or up, or null at the end of its range. */
export function stepLapsLeft(laps: number, step: -1 | 1): number | null {
  const next = laps + step
  return next < FUEL_LAPS_LEFT_MIN || next > FUEL_LAPS_LEFT_MAX ? null : next
}

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
