// Types and Wails bindings for Dash Studio and VoCore screen selection.

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

export interface DetectedScreen {
  vid: number
  pid: number
  serial: string
  width: number
  height: number
  description: string
  driver: DriverType
}

export interface SavedScreen {
  vid: number
  pid: number
  serial: string
  width: number
  height: number
  name: string
  rotation: number  // 0 | 90 | 180 | 270
  driver: DriverType
  dashId: string    // assigned layout ID; empty = use default
}

export interface ScreenConfig {
  vid: number
  pid: number
  width: number
  height: number
  rotation: number
  driver: DriverType
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

/** @deprecated Use widgetCatalogAPI.getWidgetCatalog() — the backend is now the source of truth. */
export const WIDGET_TYPES = [
  { type: 'text',            label: 'Text',              category: 'layout', defaultColSpan: 4,  defaultRowSpan: 2,  idleCapable: true  },
  { type: 'header',         label: 'Header',           category: 'layout', defaultColSpan: 20, defaultRowSpan: 2,  idleCapable: false },
  { type: 'lap_time',       label: 'Lap Time',          category: 'timing', defaultColSpan: 5,  defaultRowSpan: 3,  idleCapable: false },
  { type: 'sector',         label: 'Sector',            category: 'timing', defaultColSpan: 6,  defaultRowSpan: 3,  idleCapable: false },
  { type: 'delta',          label: 'Delta',             category: 'timing', defaultColSpan: 4,  defaultRowSpan: 3,  idleCapable: false },
  { type: 'speed',          label: 'Speed',             category: 'car',    defaultColSpan: 4,  defaultRowSpan: 3,  idleCapable: false },
  { type: 'gear',           label: 'Gear',              category: 'car',    defaultColSpan: 3,  defaultRowSpan: 3,  idleCapable: false },
  { type: 'gear_speed',     label: 'Gear + Speed',      category: 'car',    defaultColSpan: 5,  defaultRowSpan: 3,  idleCapable: false },
  { type: 'rpm_bar',        label: 'RPM Bar',           category: 'car',    defaultColSpan: 2,  defaultRowSpan: 8,  idleCapable: false },
  { type: 'fuel',           label: 'Fuel',              category: 'race',   defaultColSpan: 5,  defaultRowSpan: 3,  idleCapable: false },
  { type: 'tyre_temp',      label: 'Tyre Temp',         category: 'race',   defaultColSpan: 10, defaultRowSpan: 4,  idleCapable: false },
  { type: 'input_trace',    label: 'Input Trace',       category: 'car',    defaultColSpan: 6,  defaultRowSpan: 3,  idleCapable: false },
  { type: 'lap_counter',    label: 'Lap Counter',       category: 'timing', defaultColSpan: 4,  defaultRowSpan: 2,  idleCapable: false },
  { type: 'session_timer',  label: 'Session Timer',     category: 'timing', defaultColSpan: 4,  defaultRowSpan: 2,  idleCapable: false },
  { type: 'gap',            label: 'Gap',               category: 'race',   defaultColSpan: 4,  defaultRowSpan: 3,  idleCapable: false },
  { type: 'position',       label: 'Position',          category: 'race',   defaultColSpan: 3,  defaultRowSpan: 2,  idleCapable: false },
  { type: 'brake_bias',     label: 'Brake Bias',        category: 'car',    defaultColSpan: 3,  defaultRowSpan: 2,  idleCapable: false },
  { type: 'tc',             label: 'Traction Control',  category: 'car',    defaultColSpan: 3,  defaultRowSpan: 2,  idleCapable: false },
  { type: 'abs',            label: 'ABS',               category: 'car',    defaultColSpan: 3,  defaultRowSpan: 2,  idleCapable: false },
  { type: 'engine_map',     label: 'Engine Map',        category: 'car',    defaultColSpan: 3,  defaultRowSpan: 2,  idleCapable: false },
  { type: 'virtual_energy', label: 'Virtual Energy',    category: 'race',   defaultColSpan: 4,  defaultRowSpan: 3,  idleCapable: false },
  { type: 'incidents',      label: 'Incidents',         category: 'race',   defaultColSpan: 3,  defaultRowSpan: 2,  idleCapable: false },
  { type: 'flags',          label: 'Flags',             category: 'race',   defaultColSpan: 4,  defaultRowSpan: 2,  idleCapable: true  },
] as const

export type WidgetType = (typeof WIDGET_TYPES)[number]['type']

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

function normDetectedScreen(raw: unknown): DetectedScreen {
  const r = raw as Record<string, unknown>
  return {
    vid:         Number(r.vid         ?? r.VID         ?? 0),
    pid:         Number(r.pid         ?? r.PID         ?? 0),
    serial:      String(r.serial      ?? r.Serial      ?? ''),
    width:       Number(r.width       ?? r.Width       ?? 0),
    height:      Number(r.height      ?? r.Height      ?? 0),
    description: String(r.description ?? r.Description ?? ''),
    driver:      (r.driver ?? r.Driver ?? 'vocore') as DriverType,
  }
}

function normSavedScreen(raw: unknown): SavedScreen {
  const r = raw as Record<string, unknown>
  return {
    vid:      Number(r.vid      ?? r.VID      ?? 0),
    pid:      Number(r.pid      ?? r.PID      ?? 0),
    serial:   String(r.serial   ?? r.Serial   ?? ''),
    width:    Number(r.width    ?? r.Width    ?? 0),
    height:   Number(r.height   ?? r.Height   ?? 0),
    name:     String(r.name     ?? r.Name     ?? ''),
    rotation: Number(r.rotation ?? r.Rotation ?? 0),
    driver:   (r.driver ?? r.Driver ?? 'vocore') as DriverType,
    dashId:   String(r.dash_id  ?? r.DashID   ?? r.dashId ?? ''),
  }
}

// Dash API.

export const dashAPI = {
  async listLayouts(): Promise<LayoutMeta[]> {
    const raw = await call<unknown[]>('DashListLayouts')
    return Array.isArray(raw) ? raw.map(normLayoutMeta) : []
  },

  async loadLayout(): Promise<DashLayout> {
    const raw = await call<unknown>('DashLoadLayout')
    return normLayout(raw)
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

// Device screen API.

export const deviceScreenAPI = {
  async scanScreens(): Promise<DetectedScreen[]> {
    const raw = await call<unknown[]>('DeviceScanScreens')
    return Array.isArray(raw) ? raw.map(normDetectedScreen) : []
  },

  async getSavedScreens(): Promise<SavedScreen[]> {
    const raw = await call<unknown[]>('DeviceGetSavedScreens')
    return Array.isArray(raw) ? raw.map(normSavedScreen) : []
  },

  async getScreen(): Promise<SavedScreen | null> {
    try {
      const raw = await call<unknown>('DeviceGetScreen')
      if (!raw) return null
      return normSavedScreen(raw)
    } catch {
      return null
    }
  },

  async selectScreen(
    vid: number, pid: number, serial: string,
    width: number, height: number, driver: DriverType,
  ): Promise<void> {
    await call<void>('DeviceSelectScreen', vid, pid, serial, width, height, driver)
  },

  async renameScreen(vid: number, pid: number, serial: string, name: string): Promise<void> {
    await call<void>('DeviceRenameScreen', vid, pid, serial, name)
  },

  async setScreenRotation(vid: number, pid: number, serial: string, rotation: number): Promise<void> {
    await call<void>('DeviceSetScreenRotation', vid, pid, serial, rotation)
  },

  async setDashLayout(vid: number, pid: number, serial: string, dashId: string): Promise<void> {
    await call<void>('DeviceSetDashLayout', vid, pid, serial, dashId)
  },

  async setScreenPaused(paused: boolean): Promise<void> {
    await call<void>('DeviceSetScreenPaused', paused)
  },

  async getScreenPaused(): Promise<boolean> {
    try {
      return await call<boolean>('DeviceGetScreenPaused')
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

/** @deprecated Use deviceScreenAPI instead */
export const voCoreAPI = deviceScreenAPI

// Device binding API.

export interface DeviceBinding {
  button: number
  command: string
}

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
