/**
 * Narrow reads off the host's `settings` blob (`SprintState['settings']`, an
 * untyped record — see bridge.ts). Each helper here is the single place that
 * interprets one settings field, so callers never re-parse it themselves.
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Mirrors `RuntimeCoordinator.UpdateSettings`'s `sidebarCollapsed` field. */
export const readSidebarCollapsed = (settings: Record<string, unknown>): boolean =>
  typeof settings.sidebarCollapsed === 'boolean' ? settings.sidebarCollapsed : false

/** Mirrors `AppSettings.Cloud.WebAppUrl`. Null when unset so callers can render a disabled state instead of a dead link. */
export const readWebAppUrl = (settings: Record<string, unknown>): string | null => {
  const cloud = settings.cloud
  if (!isRecord(cloud) || typeof cloud.webAppUrl !== 'string') return null
  const trimmed = cloud.webAppUrl.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** Mirrors `AppSettings.DriverName`. Null when unset so the account row can fall back to "Sign in". */
export const readDriverName = (settings: Record<string, unknown>): string | null => {
  const name = settings.driverName
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : null
}
