import { isRecord } from './frames.js'

/**
 * The update decisions, free of Electron: what the host's persisted settings say, what the
 * updater is doing, and what a settings change asks of it. `updates.ts` runs electron-updater
 * on top of these.
 */

/** The driver's update settings, read from the host's `state.updates`. */
export type UpdateSettings = { prerelease: boolean; autoInstall: boolean }

/**
 * Where the updater stands, pushed to every renderer (`src/bridge.ts` narrows it again).
 * `available` only happens with automatic installs off: the driver starts the download.
 * `ready` installs when Sprint quits, or right away from "Restart now".
 */
export type UpdateStatus =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'failed'; reason: string }

/** Null until the host's state carries the settings. */
export const readUpdateSettings = (state: unknown): UpdateSettings | null => {
  if (!isRecord(state) || !isRecord(state.updates)) return null
  const { channel, autoInstall } = state.updates
  if (typeof channel !== 'string' || typeof autoInstall !== 'boolean') return null
  return { prerelease: channel === 'pre-release', autoInstall }
}

export type FollowUp = 'none' | 'check' | 'download'

/**
 * What the updater does after the settings were read. The first read is the startup check. A
 * channel switch checks again, unless an update is already on its way. Turning automatic
 * installs on fetches an update the driver had left waiting.
 */
export const followUp = (previous: UpdateSettings | null, next: UpdateSettings, status: UpdateStatus): FollowUp => {
  if (previous === null) return 'check'
  const busy = status.kind === 'checking' || status.kind === 'downloading' || status.kind === 'ready'
  if (previous.prerelease !== next.prerelease && !busy) return 'check'
  if (!previous.autoInstall && next.autoInstall && status.kind === 'available') return 'download'
  return 'none'
}
