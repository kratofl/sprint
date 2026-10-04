import { useCallback, useState } from 'react'
import type { UpdateInstallResult } from '../bridge'

/**
 * Update domain shared by Settings (channel, check, install) and Help (running
 * version + check). `sprint.updates` and the object `bridge.checkUpdates`
 * resolves to are not part of the typed `SprintState`/`SprintBridge`
 * contracts in bridge.ts, so both are narrowed here, once, from `unknown`
 * rather than trusted or cast. `bridge.installUpdate` is already typed at the
 * bridge boundary (`UpdateInstallResult`), so `useUpdateInstall` below just
 * models it as UI state.
 */

/** `state.updates`: the running build version and its update channel. */
export type UpdatesInfo = { version: string; channel: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const parseUpdatesInfo = (sprint: unknown): UpdatesInfo | null => {
  if (!isRecord(sprint) || !isRecord(sprint.updates)) return null
  const { version, channel } = sprint.updates
  if (typeof version !== 'string' || typeof channel !== 'string') return null
  return { version, channel }
}

type RawCheckResult = { updateAvailable: boolean; latestVersion: string | null; releaseUrl: string | null }

const parseCheckResult = (value: unknown): RawCheckResult | null => {
  if (!isRecord(value) || typeof value.updateAvailable !== 'boolean') return null
  const latest = value.latest
  if (!isRecord(latest)) return { updateAvailable: value.updateAvailable, latestVersion: null, releaseUrl: null }
  return {
    updateAvailable: value.updateAvailable,
    latestVersion: typeof latest.version === 'string' ? latest.version : null,
    releaseUrl: typeof latest.url === 'string' ? latest.url : null,
  }
}

/** "available" carries a version + an optional release link; installing it is a separate, explicit step (`useUpdateInstall`). */
export type UpdateCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  | { status: 'available'; latestVersion: string; releaseUrl: string | null }
  | { status: 'failed' }

/** Drives one `bridge.checkUpdates` call and models the result as a closed state instead of optional fields. */
export function useUpdateCheck(checkUpdates: (force: boolean) => Promise<unknown>) {
  const [state, setState] = useState<UpdateCheckState>({ status: 'idle' })

  const check = useCallback(
    async (force: boolean) => {
      setState({ status: 'checking' })
      try {
        const result = parseCheckResult(await checkUpdates(force))
        if (!result) {
          setState({ status: 'failed' })
          return
        }
        setState(
          result.updateAvailable
            ? { status: 'available', latestVersion: result.latestVersion ?? 'unknown', releaseUrl: result.releaseUrl }
            : { status: 'up-to-date' },
        )
      } catch {
        setState({ status: 'failed' })
      }
    },
    [checkUpdates],
  )

  return { state, check }
}

/**
 * One-click self-replacing install (old app: `ConfirmAndInstallUpdate`/`InstallUpdate`).
 * `confirming` is a distinct state — the app closes and restarts to install, so this always
 * asks first rather than installing straight from a single click. There is no `installed`
 * state: on a genuine `staged` outcome the main process quits the whole app once this
 * resolves, so nothing is left to render.
 */
export type UpdateInstallState =
  | { status: 'idle' }
  | { status: 'confirming' }
  | { status: 'installing' }
  | { status: 'unavailable' }
  | { status: 'failed'; reason: string }

/** Drives one `bridge.installUpdate` call and models the result as a closed state instead of optional fields. */
export function useUpdateInstall(installUpdate: () => Promise<UpdateInstallResult>) {
  const [state, setState] = useState<UpdateInstallState>({ status: 'idle' })

  const requestConfirm = useCallback(() => setState({ status: 'confirming' }), [])
  const cancel = useCallback(() => setState({ status: 'idle' }), [])

  const install = useCallback(async () => {
    setState({ status: 'installing' })
    try {
      const result = await installUpdate()
      switch (result.outcome) {
        case 'unavailable-in-dev':
          setState({ status: 'unavailable' })
          return
        case 'no-update':
          setState({ status: 'idle' })
          return
        case 'staged':
          // The main process quits the app once this call resolves; nothing left to render.
          return
        case 'failed':
          setState({ status: 'failed', reason: result.reason })
      }
    } catch {
      setState({ status: 'failed', reason: 'Could not reach the update service.' })
    }
  }, [installUpdate])

  return { state, requestConfirm, cancel, install }
}
