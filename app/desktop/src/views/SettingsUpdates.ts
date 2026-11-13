/**
 * `state.updates`, shared by Settings (channel, automatic installs) and Help (the running
 * version). It is not part of the typed `SprintState` in bridge.ts, so it is narrowed here, once,
 * from `unknown`. Where an update stands is the main process's business: `bridge.subscribeUpdates`.
 */

/** The running build version, its update channel, and whether updates install on their own. */
export type UpdatesInfo = { version: string; channel: string; autoInstall: boolean }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const parseUpdatesInfo = (sprint: unknown): UpdatesInfo | null => {
  if (!isRecord(sprint) || !isRecord(sprint.updates)) return null
  const { version, channel, autoInstall } = sprint.updates
  if (typeof version !== 'string' || typeof channel !== 'string') return null
  return { version, channel, autoInstall: autoInstall !== false }
}
