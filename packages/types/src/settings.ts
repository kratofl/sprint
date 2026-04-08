// Mirrors app/internal/settings/settings.go and app/internal/updater/updater.go

export interface AppSettings {
  updateChannel: 'stable' | 'pre-release'
}

export interface ReleaseInfo {
  version: string
  downloadURL: string
  releaseNotes: string
  isPrerelease: boolean
}
