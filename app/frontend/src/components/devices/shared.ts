import type { DeviceType, SavedDevice } from '@/lib/dash'

export const DEVICE_TYPES: DeviceType[] = ['wheel', 'screen', 'buttonbox']

export const SECTION_LABELS: Record<DeviceType, string> = {
  wheel: 'WHEELS',
  screen: 'SCREENS',
  buttonbox: 'BUTTON_BOXES',
}

export type PanelView =
  | { tag: 'empty' }
  | { tag: 'catalog'; filterType: DeviceType }
  | { tag: 'detail'; key: string }

export function deviceKey(device: SavedDevice) {
  return `${device.vid}-${device.pid}-${device.serial}`
}
