import type { DashColours, DashUnits } from '@sprint/dashboard'
import { parseColours } from '../colours'

/**
 * Settings domain model and parsing: the `AppSettings` fields the Settings page shows and
 * edits through `settings.update` (`RuntimeCoordinator.UpdateSettings`), and the colours through
 * `settings.colours`. sidebarCollapsed is
 * owned by the shell's list toggle (the explorer), and the other slices (dashEditorUI, newDashDefaults,
 * devicesUI, sessionPlanner, liveCompare, cloud) are each edited from their own feature, so
 * they are not modelled here.
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

/** The Units choices, in the order the Settings page offers them. */
export const UNITS: ReadonlyArray<{ id: DashUnits; label: string; detail: string }> = [
  { id: 'Metric', label: 'Metric', detail: 'Dashes show km/h, °C, kPa and litres' },
  { id: 'Imperial', label: 'Imperial', detail: 'Dashes show mph, °F, psi and US gallons' },
]

export type AppSettings = {
  driverName: string
  driverNumber: string
  updateChannel: UpdateChannel
  /** What every dash prints speeds, temperatures, pressures and fuel in (host `AppSettings.Units`). */
  units: DashUnits
  /** What colours mean and where values change colour, on the dashes, the pit wall and in Analysis (host `AppSettings.Colours`). */
  colours: DashColours
}

const str = (row: Record<string, unknown>, key: string, fallback: string): string => {
  const value = row[key]
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

export const parseSettings = (row: Record<string, unknown>): AppSettings => ({
  driverName: str(row, 'driverName', 'Your Name'),
  driverNumber: str(row, 'driverNumber', '22'),
  updateChannel: normalizeChannel(str(row, 'updateChannel', 'stable')),
  units: row.units === 'Imperial' ? 'Imperial' : 'Metric',
  colours: parseColours(row.colours),
})
