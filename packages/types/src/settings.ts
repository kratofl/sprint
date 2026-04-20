// Mirrors app/internal/settings/settings.go and app/internal/updater/updater.go

export interface AppSettings {
  updateChannel: 'stable' | 'pre-release'
  driverName?: string
  driverNumber?: string
}

export interface ReleaseInfo {
  version: string
  downloadURL: string
  releaseNotes: string
  isPrerelease: boolean
}

// Mirrors app/internal/dashboard/widgets/format_prefs.go

/** Controls how lap and sector times are displayed. */
export type LapFormat = 'M:SS.mmm' | 'M:SS.mm' | 'SS.mmm'

/** Controls the display unit for speed values. */
export type SpeedUnit = 'kph' | 'mph'

/** Controls the display unit for temperature values. */
export type TempUnit = 'c' | 'f'

/** Controls the display unit for pressure values. */
export type PressureUnit = 'kpa' | 'psi' | 'bar'

/** Controls the number of decimal places shown for delta and gap values. */
export type DeltaPrecision = '2' | '3'

/** Per-data-type display format choices. Mirrors widgets.FormatPreferences. */
export interface FormatPreferences {
  lapFormat?: LapFormat
  speedUnit?: SpeedUnit
  tempUnit?: TempUnit
  pressureUnit?: PressureUnit
  deltaPrecision?: DeltaPrecision
}
