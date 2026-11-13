import type { UpdateStatus } from '../bridge'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * Narrows the main process's update status (`bridge.subscribeUpdates`) once; anything unexpected
 * reads as a failure.
 */
export const parseUpdateStatus = (value: unknown): UpdateStatus => {
  const failed: UpdateStatus = { kind: 'failed', reason: 'The updater sent an unexpected status.' }
  if (!isRecord(value)) return failed
  const version = typeof value.version === 'string' ? value.version : null
  switch (value.kind) {
    case 'unsupported':
    case 'idle':
    case 'checking':
    case 'up-to-date':
      return { kind: value.kind }
    case 'available':
    case 'ready':
      return version === null ? failed : { kind: value.kind, version }
    case 'downloading':
      return version === null || typeof value.percent !== 'number' ? failed : { kind: 'downloading', version, percent: value.percent }
    case 'failed':
      return { kind: 'failed', reason: typeof value.reason === 'string' && value.reason.length > 0 ? value.reason : 'The update failed.' }
    default:
      return failed
  }
}

export const displayVersion = (version: string): string => (version.startsWith('v') ? version : `v${version}`)
