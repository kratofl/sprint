import {
  DashCreateLayout,
  DashCyclePage,
  DashDeleteLayout,
  DashGetDefaultDomainPalette,
  DashGetDefaultFormatPreferences,
  DashGetDefaultTheme,
  DashGetGlobalSettings,
  DashGetPreview,
  DashListLayouts,
  DashLoadLayoutByID,
  DashSaveGlobalSettings,
  DashSaveLayout,
  DashSetDefault,
  DashStartPreview,
  DashStopPreview,
  DashUpdatePreview,
  DeviceAdd,
  DeviceAddScanned,
  DeviceGetCatalog,
  DeviceGetDeviceBindings,
  DeviceGetDeviceDisabled,
  DeviceGetSavedDevices,
  DeviceGetScreenStatus,
  DeviceRemoveDevice,
  DeviceRenameDevice,
  DeviceSaveDeviceBindings,
  DeviceScanUnregistered,
  DeviceSelectCaptureRegion,
  DeviceSetDashLayout,
  DeviceSetDeviceDisabled,
  DeviceSetPurpose,
  DeviceSetPurposeConfig,
  DeviceSetScreenOffset,
  DeviceSetScreenRotation,
  GetAlertCatalog,
  GetWidgetCatalog,
  GetWidgetPreview,
} from '../../../wailsjs/go/main/App'
import { runDesktopCall } from '../wails'
import { DEFAULT_DASH_THEME } from './defaults.ts'
import {
  adaptAlertMeta,
  adaptCatalogEntry,
  adaptDetectedScreen,
  adaptGlobalDashSettings,
  adaptLayout,
  adaptLayoutMeta,
  adaptSavedDevice,
  adaptWidgetCatalogEntry,
  encodePurposeConfig,
} from './adapters.ts'
import type {
  AlertMeta,
  CatalogEntry,
  DashLayout,
  DashTheme,
  DetectedScreen,
  DeviceBinding,
  DevicePurpose,
  GlobalDashSettings,
  LayoutMeta,
  RearViewConfig,
  SavedDevice,
  ScreenStatus,
  WidgetCatalogEntry,
} from './types.ts'
import type { DomainPalette, FormatPreferences } from './types.ts'

function normalizeScreenStatus(value: string): ScreenStatus {
  if (value === 'connected' || value === 'disconnected') return value
  return 'unknown'
}

export const dashAPI = {
  async listLayouts(): Promise<LayoutMeta[]> {
    return runDesktopCall('DashListLayouts', async () => {
      const layouts = await DashListLayouts()
      return layouts.map(layout => adaptLayoutMeta(layout as unknown as Record<string, unknown>))
    })
  },

  async loadLayoutByID(id: string): Promise<DashLayout> {
    return runDesktopCall('DashLoadLayoutByID', async () =>
      adaptLayout(await DashLoadLayoutByID(id) as unknown as Record<string, unknown>))
  },

  async saveLayout(layout: DashLayout): Promise<void> {
    await runDesktopCall('DashSaveLayout', () => DashSaveLayout(layout as never))
  },

  async createLayout(name: string): Promise<DashLayout> {
    return runDesktopCall('DashCreateLayout', async () =>
      adaptLayout(await DashCreateLayout(name) as unknown as Record<string, unknown>))
  },

  async deleteLayout(id: string): Promise<void> {
    await runDesktopCall('DashDeleteLayout', () => DashDeleteLayout(id))
  },

  async setDefault(id: string): Promise<void> {
    await runDesktopCall('DashSetDefault', () => DashSetDefault(id))
  },

  async getPreview(id: string): Promise<string> {
    return runDesktopCall('DashGetPreview', () => DashGetPreview(id))
  },

  async cyclePage(direction: number): Promise<void> {
    await runDesktopCall('DashCyclePage', () => DashCyclePage(direction))
  },

  async startPreview(layout: DashLayout, pageIndex: number, idle: boolean): Promise<void> {
    await runDesktopCall('DashStartPreview', () => DashStartPreview(layout as never, pageIndex, idle))
  },

  async stopPreview(): Promise<void> {
    await runDesktopCall('DashStopPreview', () => DashStopPreview())
  },

  async updatePreview(layout: DashLayout, pageIndex: number, idle: boolean): Promise<void> {
    await runDesktopCall('DashUpdatePreview', () => DashUpdatePreview(layout as never, pageIndex, idle))
  },

  async getGlobalSettings(): Promise<GlobalDashSettings> {
    return runDesktopCall('DashGetGlobalSettings', async () =>
      adaptGlobalDashSettings(await DashGetGlobalSettings() as unknown as Record<string, unknown>))
  },

  async saveGlobalSettings(settings: GlobalDashSettings): Promise<void> {
    await runDesktopCall('DashSaveGlobalSettings', () => DashSaveGlobalSettings(settings as never))
  },

  async getDefaultTheme(): Promise<DashTheme> {
    return runDesktopCall('DashGetDefaultTheme', async () =>
      await DashGetDefaultTheme() as unknown as DashTheme ?? DEFAULT_DASH_THEME)
  },

  async getDefaultDomainPalette(): Promise<DomainPalette> {
    return runDesktopCall('DashGetDefaultDomainPalette', () => DashGetDefaultDomainPalette() as unknown as Promise<DomainPalette>)
  },

  async getDefaultFormatPreferences(): Promise<FormatPreferences> {
    return runDesktopCall('DashGetDefaultFormatPreferences', () => DashGetDefaultFormatPreferences() as unknown as Promise<FormatPreferences>)
  },
}

export const deviceAPI = {
  async getCatalog(): Promise<CatalogEntry[]> {
    return runDesktopCall('DeviceGetCatalog', async () => {
      const entries = await DeviceGetCatalog()
      return entries.map(entry => adaptCatalogEntry(entry as unknown as Record<string, unknown>))
    })
  },

  async getSavedDevices(): Promise<SavedDevice[]> {
    return runDesktopCall('DeviceGetSavedDevices', async () => {
      const devices = await DeviceGetSavedDevices()
      return devices.map(device => adaptSavedDevice(device as unknown as Record<string, unknown>))
    })
  },

  async addDevice(catalogID: string): Promise<void> {
    await runDesktopCall('DeviceAdd', () => DeviceAdd(catalogID))
  },

  async scanUnregistered(catalogID: string): Promise<DetectedScreen[]> {
    return runDesktopCall('DeviceScanUnregistered', async () => {
      const devices = await DeviceScanUnregistered(catalogID)
      return devices.map(device => adaptDetectedScreen(device as unknown as Record<string, unknown>))
    })
  },

  async addScanned(catalogID: string, vid: number, pid: number, serial: string): Promise<void> {
    await runDesktopCall('DeviceAddScanned', () => DeviceAddScanned(catalogID, vid, pid, serial))
  },

  async removeDevice(vid: number, pid: number, serial: string): Promise<void> {
    await runDesktopCall('DeviceRemoveDevice', () => DeviceRemoveDevice(vid, pid, serial))
  },

  async renameDevice(vid: number, pid: number, serial: string, name: string): Promise<void> {
    await runDesktopCall('DeviceRenameDevice', () => DeviceRenameDevice(vid, pid, serial, name))
  },

  async setScreenRotation(vid: number, pid: number, serial: string, rotation: number): Promise<void> {
    await runDesktopCall('DeviceSetScreenRotation', () => DeviceSetScreenRotation(vid, pid, serial, rotation))
  },

  async setScreenOffset(vid: number, pid: number, serial: string, offsetX: number, offsetY: number, margin: number): Promise<void> {
    await runDesktopCall('DeviceSetScreenOffset', () => DeviceSetScreenOffset(vid, pid, serial, offsetX, offsetY, margin))
  },

  async setDashLayout(vid: number, pid: number, serial: string, dashId: string): Promise<void> {
    await runDesktopCall('DeviceSetDashLayout', () => DeviceSetDashLayout(vid, pid, serial, dashId))
  },

  async setDeviceDisabled(deviceID: string, disabled: boolean): Promise<void> {
    await runDesktopCall('DeviceSetDeviceDisabled', () => DeviceSetDeviceDisabled(deviceID, disabled))
  },

  async getDeviceDisabled(deviceID: string): Promise<boolean> {
    return runDesktopCall('DeviceGetDeviceDisabled', () => DeviceGetDeviceDisabled(deviceID))
  },

  async setDevicePurpose(vid: number, pid: number, serial: string, purpose: DevicePurpose): Promise<void> {
    await runDesktopCall('DeviceSetPurpose', () => DeviceSetPurpose(vid, pid, serial, purpose))
  },

  async setDevicePurposeConfig(vid: number, pid: number, serial: string, config: Partial<RearViewConfig>): Promise<void> {
    await runDesktopCall('DeviceSetPurposeConfig', () => DeviceSetPurposeConfig(vid, pid, serial, encodePurposeConfig(config)))
  },

  async selectCaptureRegion(vid: number, pid: number, serial: string): Promise<void> {
    await runDesktopCall('DeviceSelectCaptureRegion', () => DeviceSelectCaptureRegion(vid, pid, serial))
  },

  async getScreenStatus(): Promise<ScreenStatus> {
    return runDesktopCall('DeviceGetScreenStatus', async () => normalizeScreenStatus(await DeviceGetScreenStatus()))
  },
}

export const deviceBindingsAPI = {
  async getDeviceBindings(vid: number, pid: number, serial: string): Promise<DeviceBinding[]> {
    return runDesktopCall('DeviceGetDeviceBindings', async () => {
      const bindings = await DeviceGetDeviceBindings(vid, pid, serial)
      return bindings.map(binding => ({ button: binding.button, command: binding.command }))
    })
  },

  async saveDeviceBindings(vid: number, pid: number, serial: string, bindings: DeviceBinding[]): Promise<void> {
    await runDesktopCall('DeviceSaveDeviceBindings', () => DeviceSaveDeviceBindings(vid, pid, serial, bindings as never))
  },
}

export const widgetCatalogAPI = {
  async getWidgetCatalog(): Promise<WidgetCatalogEntry[]> {
    return runDesktopCall('GetWidgetCatalog', async () => {
      const widgets = await GetWidgetCatalog()
      return widgets.map(widget => adaptWidgetCatalogEntry(widget as unknown as Record<string, unknown>))
    })
  },

  async getWidgetPreview(widgetType: string, colSpan: number, rowSpan: number): Promise<string> {
    return runDesktopCall('GetWidgetPreview', () => GetWidgetPreview(widgetType, colSpan, rowSpan))
  },
}

export const alertCatalogAPI = {
  async getAlertCatalog(): Promise<AlertMeta[]> {
    return runDesktopCall('GetAlertCatalog', async () => {
      const alerts = await GetAlertCatalog()
      return alerts.map(alert => adaptAlertMeta(alert as unknown as Record<string, unknown>))
    })
  },
}
