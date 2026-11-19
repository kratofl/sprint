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
 * While Sprint runs nothing downloads on its own: `available` waits for the driver, and
 * installing it downloads (`downloading`), then quits into the installer (`installing`).
 * At launch, with automatic installs on, the splash goes through the same steps by itself.
 */
export type UpdateStatus =
  | { kind: 'unsupported' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'installing'; version: string }
  | { kind: 'failed'; reason: string }

/** Null until the host's state carries the settings. */
export const readUpdateSettings = (state: unknown): UpdateSettings | null => {
  if (!isRecord(state) || !isRecord(state.updates)) return null
  const { channel, autoInstall } = state.updates
  if (typeof channel !== 'string' || typeof autoInstall !== 'boolean') return null
  return { prerelease: channel === 'pre-release', autoInstall }
}

/** An update is on its way: another check would only get in its way. */
export const isBusy = (status: UpdateStatus): boolean => status.kind === 'checking' || status.kind === 'downloading' || status.kind === 'installing'

/**
 * Whether a settings change asks for a check: only a channel switch does, unless an update is
 * already on its way. The first read asks for nothing; the launch has already decided.
 */
export const checkAfter = (previous: UpdateSettings | null, next: UpdateSettings, status: UpdateStatus): boolean =>
  previous !== null && previous.prerelease !== next.prerelease && !isBusy(status)
