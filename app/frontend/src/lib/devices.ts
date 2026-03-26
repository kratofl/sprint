// ── Types (mirror app/internal/devices) ──────────────────────────────────────

export interface WheelModel {
  id: string
  name: string
  manufacturer: string
  uSBVID: number   // Wails serialises uint16 fields with Go field name casing
  uSBPID: number
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
  listKnownModels: (): Promise<WheelModel[]> =>
    call<WheelModel[]>('DeviceListKnownModels'),

  listPorts: (): Promise<DetectedPort[]> =>
    call<DetectedPort[]>('DeviceListPorts'),

  getAll: (): Promise<DeviceConfig[]> =>
    call<DeviceConfig[]>('DeviceGetAll'),

  save: (d: DeviceConfig): Promise<DeviceConfig> =>
    call<DeviceConfig>('DeviceSave', d),

  delete: (id: string): Promise<void> =>
    call<void>('DeviceDelete', id),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function modelDisplayName(model: WheelModel): string {
  return `${model.manufacturer} ${model.name}`
}

export function deviceDisplayName(d: DeviceConfig, models: WheelModel[]): string {
  if (d.alias) return d.alias
  const model = models.find(m => m.id === d.modelId)
  return model ? modelDisplayName(model) : d.modelId
}
