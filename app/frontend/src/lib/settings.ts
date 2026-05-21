import {
  CheckUpdate,
  DownloadAndInstall,
  GetBuildChannel,
  GetSettings,
  GetVersion,
  SaveSettings,
} from '../../wailsjs/go/main/App'
import type { AppSettings, ReleaseInfo } from '@sprint/types'
import { runDesktopCall } from './wails'

export type BuildChannel = 'dev' | 'alpha' | 'beta' | 'release'

export const settingsAPI = {
  getSettings(): Promise<AppSettings> {
    return runDesktopCall('GetSettings', () => GetSettings() as unknown as Promise<AppSettings>)
  },

  saveSettings(settings: AppSettings): Promise<void> {
    return runDesktopCall('SaveSettings', () => SaveSettings(settings as never))
  },
}

export const appInfoAPI = {
  getVersion(): Promise<string> {
    return runDesktopCall('GetVersion', () => GetVersion())
  },

  async getBuildChannel(): Promise<BuildChannel> {
    return runDesktopCall('GetBuildChannel', async () => {
      const channel = await GetBuildChannel()
      if (channel === 'dev' || channel === 'alpha' || channel === 'beta' || channel === 'release') {
        return channel
      }
      return 'dev'
    })
  },
}

export const updateAPI = {
  checkNow(): Promise<ReleaseInfo | null> {
    return runDesktopCall('CheckUpdate', () => CheckUpdate() as unknown as Promise<ReleaseInfo | null>)
  },

  install(downloadURL: string): Promise<void> {
    return runDesktopCall('DownloadAndInstall', () => DownloadAndInstall(downloadURL))
  },
}
