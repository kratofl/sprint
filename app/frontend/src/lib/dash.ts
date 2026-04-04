// Types and Wails bindings for Dash Studio and VoCore screen selection.

import { call } from '@/lib/wails'

// Types.

export interface DashWidget {
  type: string
  x: number
  y: number
  w: number
  h: number
}

export interface DashLayout {
  id: string
  name: string
  widgets: DashWidget[]
}

export interface LayoutMeta {
  id: string
  name: string
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

// Widget catalogue entry mirroring widgets.WidgetMeta from Go.

export interface WidgetCatalogEntry {
  type: string
  label: string
  category: string
}

/** @deprecated Use widgetCatalogAPI.getWidgetCatalog() — the backend is now the source of truth. */
export const WIDGET_TYPES = [
  { type: 'header',    label: 'Header',    category: 'layout', defaultW: 784, defaultH: 38  },
  { type: 'lap_time',  label: 'Lap Time',  category: 'timing', defaultW: 220, defaultH: 130 },
  { type: 'sector',    label: 'Sector',    category: 'timing', defaultW: 200, defaultH: 80  },
  { type: 'delta',     label: 'Delta',     category: 'timing', defaultW: 220, defaultH: 100 },
  { type: 'speed',     label: 'Speed',     category: 'car',    defaultW: 120, defaultH: 100 },
  { type: 'gear',      label: 'Gear',      category: 'car',    defaultW: 90,  defaultH: 110 },
  { type: 'rpm_bar',   label: 'RPM Bar',   category: 'car',    defaultW: 40,  defaultH: 360 },
  { type: 'fuel',      label: 'Fuel',      category: 'race',   defaultW: 200, defaultH: 80  },
  { type: 'tyre_temp', label: 'Tyre Temp', category: 'race',   defaultW: 200, defaultH: 110 },
] as const

export type WidgetType = (typeof WIDGET_TYPES)[number]['type']

// Wails binding helper.

// Wails returns Go struct fields with capital letters; normalise to camelCase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normWidget(raw: any): DashWidget {
  return {
    type: raw.type ?? raw.Type ?? '',
    x: raw.x ?? raw.X ?? 0,
    y: raw.y ?? raw.Y ?? 0,
    w: raw.w ?? raw.W ?? 0,
    h: raw.h ?? raw.H ?? 0,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normLayout(raw: any): DashLayout {
  return {
    id:      raw.id      ?? raw.ID      ?? '',
    name:    raw.name    ?? raw.Name    ?? '',
    widgets: Array.isArray(raw?.widgets ?? raw?.Widgets)
      ? (raw.widgets ?? raw.Widgets).map(normWidget)
      : [],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normLayoutMeta(raw: any): LayoutMeta {
  return {
    id:   raw.id   ?? raw.ID   ?? '',
    name: raw.name ?? raw.Name ?? '',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normDetectedScreen(raw: any): DetectedScreen {
  return {
    vid:         raw.vid         ?? raw.VID         ?? 0,
    pid:         raw.pid         ?? raw.PID         ?? 0,
    serial:      raw.serial      ?? raw.Serial      ?? '',
    width:       raw.width       ?? raw.Width       ?? 0,
    height:      raw.height      ?? raw.Height      ?? 0,
    description: raw.description ?? raw.Description ?? '',
    driver:      raw.driver      ?? raw.Driver      ?? 'vocore',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normSavedScreen(raw: any): SavedScreen {
  return {
    vid:      raw.vid      ?? raw.VID      ?? 0,
    pid:      raw.pid      ?? raw.PID      ?? 0,
    serial:   raw.serial   ?? raw.Serial   ?? '',
    width:    raw.width    ?? raw.Width    ?? 0,
    height:   raw.height   ?? raw.Height   ?? 0,
    name:     raw.name     ?? raw.Name     ?? '',
    rotation: raw.rotation ?? raw.Rotation ?? 0,
    driver:   raw.driver   ?? raw.Driver   ?? 'vocore',
    dashId:   raw.dash_id  ?? raw.DashID   ?? raw.dashId ?? '',
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

// Widget catalog API.

export const widgetCatalogAPI = {
  async getWidgetCatalog(): Promise<WidgetCatalogEntry[]> {
    const raw = await call<unknown[]>('GetWidgetCatalog')
    if (!Array.isArray(raw)) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.map((r: any): WidgetCatalogEntry => ({
      type:     r.type     ?? '',
      label:    r.label    ?? '',
      category: r.category ?? '',
    }))
  },
}
