/**
 * Narrow reads off the host's `settings` blob (`SprintState['settings']`, an
 * untyped record — see bridge.ts). Each helper here is the single place that
 * interprets one settings field, so callers never re-parse it themselves.
 */

/** Mirrors `RuntimeCoordinator.UpdateSettings`'s `sidebarCollapsed` field. */
export const readSidebarCollapsed = (settings: Record<string, unknown>): boolean =>
  typeof settings.sidebarCollapsed === 'boolean' ? settings.sidebarCollapsed : false
