// ── Types (mirror app/internal/devices) ──────────────────────────────────────

export interface WheelModel {
  id: string
  name: string
  manufacturer: string
  usbVID: number
  usbPID: number
  screenVID: number
  screenPID: number
  screenWidth: number
  screenHeight: number
  defaultBaud: number
}

export interface DeviceConfig {
  id: string
  modelId: string
  alias: string
  port: string
}

export interface DetectedPort {
  name: string
  isUsb: boolean
  matchedModel: WheelModel | null
  description: string
}

export function newDeviceConfig(): DeviceConfig {
  return { id: '', modelId: '', alias: '', port: '' }
}

// ── Wails binding helper ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function call<T>(method: string, ...args: unknown[]): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = (window as any)?.go?.main?.App ?? null
  if (!app || typeof app[method] !== 'function') {
    return Promise.reject(new Error(`Wails binding not available: App.${method}`))
  }
  return app[method](...args) as Promise<T>
}

// ── API ───────────────────────────────────────────────────────────────────────

export const deviceAPI = {
  listKnownModels: async (): Promise<WheelModel[]> => {
    const items = await call<RawWheelModel[]>('DeviceListKnownModels')
    return items.map(toWheelModel)
  },

  listPorts: async (): Promise<DetectedPort[]> => {
    const items = await call<RawDetectedPort[]>('DeviceListPorts')
    return items.map(toDetectedPort)
  },

  getAll: (): Promise<DeviceConfig[]> =>
    call<DeviceConfig[]>('DeviceGetAll'),

  save: (d: DeviceConfig): Promise<DeviceConfig> =>
    call<DeviceConfig>('DeviceSave', d),

  delete: (id: string): Promise<void> =>
    call<void>('DeviceDelete', id),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RawWheelModel {
  id?: string
  ID?: string
  name?: string
  Name?: string
  manufacturer?: string
  Manufacturer?: string
  usbVID?: number
  USBVID?: number
  usbPID?: number
  USBPID?: number
  screenVID?: number
  ScreenVID?: number
  screenPID?: number
  ScreenPID?: number
  screenWidth?: number
  ScreenWidth?: number
  screenHeight?: number
  ScreenHeight?: number
  defaultBaud?: number
  DefaultBaud?: number
}

interface RawDetectedPort {
  name?: string
  isUsb?: boolean
  matchedModel?: RawWheelModel | null
  description?: string
}

function toWheelModel(raw: RawWheelModel): WheelModel {
  return {
    id: raw.id ?? raw.ID ?? '',
    name: raw.name ?? raw.Name ?? '',
    manufacturer: raw.manufacturer ?? raw.Manufacturer ?? '',
    usbVID: raw.usbVID ?? raw.USBVID ?? 0,
    usbPID: raw.usbPID ?? raw.USBPID ?? 0,
    screenVID: raw.screenVID ?? raw.ScreenVID ?? 0,
    screenPID: raw.screenPID ?? raw.ScreenPID ?? 0,
    screenWidth: raw.screenWidth ?? raw.ScreenWidth ?? 0,
    screenHeight: raw.screenHeight ?? raw.ScreenHeight ?? 0,
    defaultBaud: raw.defaultBaud ?? raw.DefaultBaud ?? 0,
  }
}

function toDetectedPort(raw: RawDetectedPort): DetectedPort {
  return {
    name: raw.name ?? '',
    isUsb: raw.isUsb ?? false,
    matchedModel: raw.matchedModel ? toWheelModel(raw.matchedModel) : null,
    description: raw.description ?? '',
  }
}

export function modelDisplayName(model: WheelModel): string {
  const label = `${model.manufacturer} ${model.name}`.trim()
  return label || model.id
}

export function deviceDisplayName(d: DeviceConfig, models: WheelModel[]): string {
  if (d.alias) return d.alias
  const model = models.find(m => m.id === d.modelId)
  return model ? modelDisplayName(model) : d.modelId
}
