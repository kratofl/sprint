// Types and Wails bindings for Dash Studio and VoCore screen selection.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashWidget {
  type: string
  x: number
  y: number
  w: number
  h: number
}

export interface DashLayout {
  widgets: DashWidget[]
}

export interface DetectedScreen {
  vid: number
  pid: number
  serial: string
  width: number
  height: number
  description: string
}

export interface ScreenConfig {
  vid: number
  pid: number
  width: number
  height: number
}

// ── Widget catalogue ──────────────────────────────────────────────────────────

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

// ── Wails binding helper ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function call<T>(method: string, ...args: unknown[]): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = (window as any)?.go?.main?.App ?? null
  if (!app || typeof app[method] !== 'function') {
    return Promise.reject(new Error(`Wails method not available: ${method}`))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (app[method] as (...a: any[]) => Promise<T>)(...args)
}

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
    widgets: Array.isArray(raw?.widgets ?? raw?.Widgets)
      ? (raw.widgets ?? raw.Widgets).map(normWidget)
      : [],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normScreen(raw: any): DetectedScreen {
  return {
    vid:         raw.vid         ?? raw.VID         ?? 0,
    pid:         raw.pid         ?? raw.PID         ?? 0,
    serial:      raw.serial      ?? raw.Serial      ?? '',
    width:       raw.width       ?? raw.Width       ?? 0,
    height:      raw.height      ?? raw.Height      ?? 0,
    description: raw.description ?? raw.Description ?? '',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normScreenConfig(raw: any): ScreenConfig {
  return {
    vid:    raw.vid    ?? raw.VID    ?? 0,
    pid:    raw.pid    ?? raw.PID    ?? 0,
    width:  raw.width  ?? raw.Width  ?? 0,
    height: raw.height ?? raw.Height ?? 0,
  }
}

// ── Dash API ──────────────────────────────────────────────────────────────────

export const dashAPI = {
  async loadLayout(): Promise<DashLayout> {
    const raw = await call<unknown>('DashLoadLayout')
    return normLayout(raw)
  },

  async saveLayout(layout: DashLayout): Promise<void> {
    await call<void>('DashSaveLayout', layout)
  },
}

// ── Device screen API ─────────────────────────────────────────────────────────

export const deviceScreenAPI = {
  async scanScreens(): Promise<DetectedScreen[]> {
    const raw = await call<unknown[]>('DeviceScanScreens')
    return Array.isArray(raw) ? raw.map(normScreen) : []
  },

  async getScreen(): Promise<ScreenConfig | null> {
    try {
      const raw = await call<unknown>('DeviceGetScreen')
      if (!raw) return null
      return normScreenConfig(raw)
    } catch {
      return null
    }
  },

  async selectScreen(vid: number, pid: number, width: number, height: number): Promise<void> {
    await call<void>('DeviceSelectScreen', vid, pid, width, height)
  },
}

/** @deprecated Use deviceScreenAPI instead */
export const voCoreAPI = deviceScreenAPI
