/**
 * Narrows the host's `/api/updates/check` response (`bridge.checkUpdates`), which
 * mirrors .NET's `UpdateCheckResult`/`ReleaseInfo` records. Parsed once, here, so
 * the startup check and the palette's manual check share one interpretation.
 */
export type UpdateRelease = { version: string; channel: string; url: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const parseUpdateCheck = (value: unknown): UpdateRelease | null => {
  if (!isRecord(value) || value.updateAvailable !== true || !isRecord(value.latest)) return null
  const { latest } = value
  if (typeof latest.version !== 'string' || typeof latest.channel !== 'string' || typeof latest.url !== 'string') return null
  return { version: latest.version, channel: latest.channel, url: latest.url }
}

export const displayVersion = (version: string): string => (version.startsWith('v') ? version : `v${version}`)
