// Types and Wails bindings for Dash Studio and device management.

import { call } from '@/lib/wails'

export interface AlertConfig {
  tcChange: boolean
  absChange: boolean
  engineMapChange: boolean
}

export interface DashWidget {
  id: string
  type: string
  col: number
  row: number
  colSpan: number
  rowSpan: number
  config?: Record<string, unknown>
}

export interface DashPage {
  id: string
  name: string
  widgets: DashWidget[]
}

export interface DashLayout {
  id: string
  name: string
  default: boolean
  gridCols: number
  gridRows: number
  idlePage: DashPage
  pages: DashPage[]
  alerts: AlertConfig
}

export interface LayoutMeta {
  id: string
  name: string
  default: boolean
  pageCount: number
  gridCols: number
  gridRows: number
  previewAvailable: boolean
}

export type DriverType = 'vocore' | 'usbd480'
export type DeviceType = 'wheel' | 'screen' | 'buttonbox'

export interface DeviceBinding {
  button: number
  command: string
}

export interface SavedDevice {
  vid: number
  pid: number
  serial: string
  type: DeviceType | ''    // '' = legacy entry treated as screen
  width: number
  height: number
  name: string
  rotation: number          // 0 | 90 | 180 | 270
  offsetX: number           // pixel offset from left edge
  offsetY: number           // pixel offset from top edge
  driver: DriverType
  dashId: string            // assigned layout ID; empty = use default
  bindings?: DeviceBinding[]
}

export interface CatalogEntry {
  id: string
  name: string
  description: string
  type: DeviceType
  vid: number
  pid: number
  width: number
  height: number
  rotation: number
  driver: DriverType
  bindings: DeviceBinding[]
}

export interface ConfigDef {
  key: string
  label: string
  type: 'select' | 'number' | 'boolean' | 'text'
  options?: { value: string; label: string }[]
  default: string
}

export interface WidgetCatalogEntry {
  type: string
  label: string
  category: string
  categoryLabel: string
  configDefs?: ConfigDef[]
  defaultColSpan: number
  defaultRowSpan: number
  idleCapable: boolean
}

// Helper: does this device have a screen?
export function deviceHasScreen(type: DeviceType | ''): boolean {
  return type === 'wheel' || type === 'screen' || type === ''
}

// Helper: compute the coordinator device ID from vid/pid/serial.
export function deviceID(vid: number, pid: number, serial: string): string {
  const v = vid.toString(16).padStart(4, '0')
  const p = pid.toString(16).padStart(4, '0')
  return serial ? `${v}-${p}-${serial}` : `${v}-${p}`
}

// Wails binding helpers — normalise raw Go struct fields (PascalCase or camelCase) to TS types.

function normWidget(raw: unknown): DashWidget {
  const r = raw as Record<string, unknown>
  return {
    id:      String(r.id      ?? r.ID      ?? ''),
    type:    String(r.type    ?? r.Type    ?? ''),
    col:     Number(r.col     ?? r.Col     ?? 0),
    row:     Number(r.row     ?? r.Row     ?? 0),
    colSpan: Number(r.colSpan ?? r.ColSpan ?? 1),
    rowSpan: Number(r.rowSpan ?? r.RowSpan ?? 1),
    config:  (r.config ?? r.Config) as Record<string, unknown> | undefined,
  }
}

function normPage(raw: unknown): DashPage {
  const r = raw as Record<string, unknown>
  const rawWidgets = r.widgets ?? r.Widgets
  return {
    id:      String(r.id   ?? r.ID   ?? ''),
    name:    String(r.name ?? r.Name ?? ''),
    widgets: Array.isArray(rawWidgets) ? (rawWidgets as unknown[]).map(normWidget) : [],
  }
}

function normAlerts(raw: unknown): AlertConfig {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    tcChange:        Boolean(r.tcChange        ?? r.TCChange        ?? false),
    absChange:       Boolean(r.absChange       ?? r.ABSChange       ?? false),
    engineMapChange: Boolean(r.engineMapChange ?? r.EngineMapChange ?? false),
  }
}

function normLayout(raw: unknown): DashLayout {
  const r = raw as Record<string, unknown>
  const rawPages    = r.pages    ?? r.Pages
  const rawIdlePage = r.idlePage ?? r.IdlePage
  return {
    id:       String(r.id      ?? r.ID      ?? ''),
    name:     String(r.name    ?? r.Name    ?? ''),
    default:  Boolean(r.default  ?? r.Default  ?? false),
    gridCols: Number(r.gridCols  ?? r.GridCols  ?? 20),
    gridRows: Number(r.gridRows  ?? r.GridRows  ?? 12),
    idlePage: rawIdlePage ? normPage(rawIdlePage) : { id: '', name: 'Idle', widgets: [] },
    pages:    Array.isArray(rawPages) ? (rawPages as unknown[]).map(normPage) : [{ id: '', name: 'Main', widgets: [] }],
    alerts:   normAlerts(r.alerts ?? r.Alerts),
  }
}

function normLayoutMeta(raw: unknown): LayoutMeta {
  const r = raw as Record<string, unknown>
  return {
    id:               String(r.id               ?? r.ID               ?? ''),
    name:             String(r.name             ?? r.Name             ?? ''),
    default:          Boolean(r.default          ?? r.Default          ?? false),
    pageCount:        Number(r.pageCount         ?? r.PageCount        ?? 0),
    gridCols:         Number(r.gridCols          ?? r.GridCols         ?? 20),
    gridRows:         Number(r.gridRows          ?? r.GridRows         ?? 12),
    previewAvailable: Boolean(r.previewAvailable ?? r.PreviewAvailable ?? false),
  }
}

function normSavedDevice(raw: unknown): SavedDevice {
  const r = raw as Record<string, unknown>
  return {
    vid:      Number(r.vid      ?? r.VID      ?? 0),
    pid:      Number(r.pid      ?? r.PID      ?? 0),
    serial:   String(r.serial   ?? r.Serial   ?? ''),
    type:     (r.type ?? r.Type ?? '') as DeviceType | '',
    width:    Number(r.width    ?? r.Width    ?? 0),
    height:   Number(r.height   ?? r.Height   ?? 0),
    name:     String(r.name     ?? r.Name     ?? ''),
    rotation: Number(r.rotation ?? r.Rotation ?? 0),
    offsetX:  Number(r.offset_x  ?? r.offsetX  ?? r.OffsetX  ?? 0),
    offsetY:  Number(r.offset_y  ?? r.offsetY  ?? r.OffsetY  ?? 0),
    driver:   (r.driver ?? r.Driver ?? 'vocore') as DriverType,
    dashId:   String(r.dash_id  ?? r.DashID   ?? r.dashId ?? ''),
    bindings: Array.isArray(r.bindings ?? r.Bindings)
      ? (r.bindings ?? r.Bindings) as DeviceBinding[]
      : [],
  }
}

function normCatalogEntry(raw: unknown): CatalogEntry {
  const r = raw as Record<string, unknown>
  return {
    id:          String(r.id          ?? r.ID          ?? ''),
    name:        String(r.name        ?? r.Name        ?? ''),
    description: String(r.description ?? r.Description ?? ''),
    type:        (r.type ?? r.Type ?? 'screen') as DeviceType,
    vid:         Number(r.vid ?? r.VID ?? 0),
    pid:         Number(r.pid ?? r.PID ?? 0),
    width:       Number(r.width    ?? r.Width    ?? 0),
    height:      Number(r.height   ?? r.Height   ?? 0),
    rotation:    Number(r.rotation ?? r.Rotation ?? 0),
    driver:      (r.driver ?? r.Driver ?? 'vocore') as DriverType,
    bindings:    Array.isArray(r.bindings ?? r.Bindings)
      ? (r.bindings ?? r.Bindings) as DeviceBinding[]
      : [],
  }
}

// Dash API.

export const dashAPI = {
  async listLayouts(): Promise<LayoutMeta[]> {
    const raw = await call<unknown[]>('DashListLayouts')
    return Array.isArray(raw) ? raw.map(normLayoutMeta) : []
  },

  async loadLayoutByID(id: string): Promise<DashLayout> {
    const raw = await call<unknown>('DashLoadLayoutByID', id)
    return normLayout(raw)
  },

  async saveLayout(layout: DashLayout): Promise<void> {
    await call<void>('DashSaveLayout', layout)
  },

  async createLayout(name: string): Promise<DashLayout> {
    const raw = await call<unknown>('DashCreateLayout', name)
    return normLayout(raw)
  },

  async deleteLayout(id: string): Promise<void> {
    await call<void>('DashDeleteLayout', id)
  },

  async setDefault(id: string): Promise<void> {
    await call<void>('DashSetDefault', id)
  },

  async getPreview(id: string): Promise<string> {
    return call<string>('DashGetPreview', id)
  },

  async cyclePage(direction: number): Promise<void> {
    await call<void>('DashCyclePage', direction)
  },
}

// Device API.

export const deviceAPI = {
  async getCatalog(): Promise<CatalogEntry[]> {
    const raw = await call<unknown[]>('DeviceGetCatalog')
    return Array.isArray(raw) ? raw.map(normCatalogEntry) : []
  },

  async getSavedDevices(): Promise<SavedDevice[]> {
    const raw = await call<unknown[]>('DeviceGetSavedDevices')
    return Array.isArray(raw) ? raw.map(normSavedDevice) : []
  },

  async addDevice(catalogID: string): Promise<void> {
    await call<void>('DeviceAdd', catalogID)
  },

  async removeDevice(vid: number, pid: number, serial: string): Promise<void> {
    await call<void>('DeviceRemoveDevice', vid, pid, serial)
  },

  async renameDevice(vid: number, pid: number, serial: string, name: string): Promise<void> {
    await call<void>('DeviceRenameDevice', vid, pid, serial, name)
  },

  async setScreenRotation(vid: number, pid: number, serial: string, rotation: number): Promise<void> {
    await call<void>('DeviceSetScreenRotation', vid, pid, serial, rotation)
  },

  async setScreenOffset(vid: number, pid: number, serial: string, offsetX: number, offsetY: number): Promise<void> {
    await call<void>('DeviceSetScreenOffset', vid, pid, serial, offsetX, offsetY)
  },

  async setDashLayout(vid: number, pid: number, serial: string, dashId: string): Promise<void> {
    await call<void>('DeviceSetDashLayout', vid, pid, serial, dashId)
  },

  async setDevicePaused(deviceID: string, paused: boolean): Promise<void> {
    await call<void>('DeviceSetDevicePaused', deviceID, paused)
  },

  async getDevicePaused(deviceID: string): Promise<boolean> {
    try {
      return await call<boolean>('DeviceGetDevicePaused', deviceID)
    } catch {
      return false
    }
  },

  async getScreenStatus(): Promise<'connected' | 'disconnected' | 'unknown'> {
    try {
      const s = await call<string>('DeviceGetScreenStatus')
      if (s === 'connected' || s === 'disconnected') return s
      return 'unknown'
    } catch {
      return 'unknown'
    }
  },
}

// Device binding API.

export const deviceBindingsAPI = {
  async getDeviceBindings(vid: number, pid: number, serial: string): Promise<DeviceBinding[]> {
    try {
      const raw = await call<unknown[]>('DeviceGetDeviceBindings', vid, pid, serial)
      if (!Array.isArray(raw)) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return raw.map((r: any): DeviceBinding => ({
        button:  r.button  ?? 0,
        command: r.command ?? '',
      }))
    } catch {
      return []
    }
  },

  async saveDeviceBindings(vid: number, pid: number, serial: string, bindings: DeviceBinding[]): Promise<void> {
    await call<void>('DeviceSaveDeviceBindings', vid, pid, serial, bindings)
  },
}

// Widget catalog API.

export const widgetCatalogAPI = {
  async getWidgetCatalog(): Promise<WidgetCatalogEntry[]> {
    const raw = await call<unknown[]>('GetWidgetCatalog')
    if (!Array.isArray(raw)) return []
    return raw.map((r: unknown): WidgetCatalogEntry => {
      const e = r as Record<string, unknown>
      return {
        type:           String(e.type          ?? ''),
        label:          String(e.label         ?? ''),
        category:       String(e.category      ?? ''),
        categoryLabel:  String(e.categoryLabel ?? e.CategoryLabel ?? e.category ?? ''),
        configDefs:     Array.isArray(e.configDefs ?? e.ConfigDefs)
          ? (e.configDefs ?? e.ConfigDefs) as ConfigDef[]
          : undefined,
        defaultColSpan: Number(e.defaultColSpan ?? e.DefaultColSpan ?? 4),
        defaultRowSpan: Number(e.defaultRowSpan ?? e.DefaultRowSpan ?? 2),
        idleCapable:    Boolean(e.idleCapable ?? e.IdleCapable ?? false),
      }
    })
  },
}
