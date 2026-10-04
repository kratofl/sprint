/**
 * Settings domain model and parsing.
 *
 * `RuntimeCoordinator.UpdateSettings` (app/Sprint.Desktop.Core/RuntimeCoordinator.cs)
 * only accepts four fields: sidebarCollapsed, updateChannel, driverName, and
 * driverNumber. sidebarCollapsed is owned by the shell's sidebar toggle, not this
 * page, so it is not surfaced here. The other `AppSettings` slices (dashEditorUI,
 * newDashDefaults, devicesUI, sessionPlanner, liveCompare, cloud) are each edited
 * from their own feature, not from the Settings page itself, so they are out of
 * scope here too.
 */
export type UpdateChannel = 'stable' | 'pre-release'

export const CHANNELS: ReadonlyArray<{ id: UpdateChannel; label: string }> = [
  { id: 'stable', label: 'Stable' },
  { id: 'pre-release', label: 'Pre-release' },
]

// AppSettings.NormalizeChannel: legacy beta/alpha values collapse to pre-release.
export const normalizeChannel = (value: string): UpdateChannel => {
  const normalized = value.trim().toLowerCase()
  return normalized === 'pre-release' || normalized === 'prerelease' || normalized === 'beta' || normalized === 'alpha'
    ? 'pre-release'
    : 'stable'
}

export type AppSettings = {
  driverName: string
  driverNumber: string
  updateChannel: UpdateChannel
}

const str = (row: Record<string, unknown>, key: string, fallback: string): string => {
  const value = row[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

export const parseSettings = (row: Record<string, unknown>): AppSettings => ({
  driverName: str(row, 'driverName', 'Your Name'),
  driverNumber: str(row, 'driverNumber', '22'),
  updateChannel: normalizeChannel(str(row, 'updateChannel', 'stable')),
})
