/**
 * `state.storage`: what the stored laps' telemetry takes on this PC, and whether old laps lose
 * theirs. Like `state.updates` it is not part of the typed `SprintState` in bridge.ts, so it is
 * narrowed here, once, from `unknown`.
 */

/** `expiryDays` 0: every lap keeps its telemetry (the default). */
export type StorageInfo = { traceBytes: number; traceLaps: number; expiryDays: number }

/** The one age limit Settings offers. */
export const TRACE_EXPIRY_DAYS = 90

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const count = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null)

export const parseStorageInfo = (sprint: unknown): StorageInfo | null => {
  if (!isRecord(sprint) || !isRecord(sprint.storage)) return null
  const traceBytes = count(sprint.storage.traceBytes)
  const traceLaps = count(sprint.storage.traceLaps)
  if (traceBytes === null || traceLaps === null) return null
  return { traceBytes, traceLaps, expiryDays: count(sprint.storage.traceExpiryDays) ?? 0 }
}

const MB = 1024 * 1024
const GB = 1024 * MB

/** A size as Windows shows it: megabytes up to a gigabyte, one decimal while that still says something. */
export const sizeText = (bytes: number): string => {
  const [value, unit] = bytes >= GB ? [bytes / GB, 'GB'] : [bytes / MB, 'MB']
  return `${value >= 100 || value === 0 ? Math.round(value) : value.toFixed(1)} ${unit}`
}

/** "1,284 laps", or what an empty store is for. */
export const lapsText = (laps: number): string => (laps === 0 ? 'Laps you drive are saved here' : `${laps.toLocaleString('en-US')} ${laps === 1 ? 'lap' : 'laps'}`)
