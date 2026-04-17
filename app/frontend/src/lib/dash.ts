// Types and Wails bindings for Dash Studio and device management.

import { call } from '@/lib/wails'
import type { FormatPreferences } from '@sprint/types'

export type { FormatPreferences }

export type RuleOp = '>' | '<' | '>=' | '<=' | '==' | '!='

export type ColorRef =
  | 'primary' | 'accent' | 'fg' | 'muted' | 'muted2'
  | 'success' | 'warning' | 'danger'
  | 'surface' | 'bg' | 'border' | 'rpmred'
  | 'abs' | 'tc' | 'brakeBias' | 'energy' | 'motor' | 'brakeMig'

export interface RGBAColor {
  R: number
  G: number
  B: number
  A: number
}

export interface DomainPalette {
  abs?:       RGBAColor
  tc?:        RGBAColor
  brakeBias?: RGBAColor
  energy?:    RGBAColor
  motor?:     RGBAColor
  brakeMig?:  RGBAColor
}

export interface DashTheme {
  primary: RGBAColor
  accent:  RGBAColor
  fg:      RGBAColor
  muted:   RGBAColor
  muted2:  RGBAColor
  success: RGBAColor
  warning: RGBAColor
  danger:  RGBAColor
  surface: RGBAColor
  bg:      RGBAColor
  border:  RGBAColor
  rpmRed:  RGBAColor
}

export interface GlobalDashSettings {
  theme:              DashTheme
  domainPalette:      DomainPalette
  formatPreferences?: FormatPreferences
}

export interface WidgetStyle {
  font?:       FontStyle
  fontSize?:   number
  textColor?:  RGBAColor
  labelColor?: RGBAColor
  labelFont?:  FontStyle
  background?: RGBAColor
}

export interface ConditionalRule {
  property: string
  op: RuleOp
  threshold: number
  color: ColorRef
  alpha?: number
}

export interface AlertInstance {
  id: string
  type: string
  config?: Record<string, unknown>
}

export interface AlertMeta {
  type: string
  label: string
  description: string
  defaultColor: string
  configDefs?: ConfigDef[]
}

export interface DashWidget {
  id: string
  type: string
  col: number
  row: number
  colSpan: number
  rowSpan: number
  config?:     Record<string, unknown>
  panelRules?: ConditionalRule[]
  style?:      WidgetStyle
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
  alerts:              AlertInstance[]
  theme?:              DashTheme
  domainPalette?:      DomainPalette
  formatPreferences?:  FormatPreferences
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
export type DevicePurpose = 'dash' | 'rear_view'
export type RearViewIdleMode = 'black' | 'clock'

export interface RearViewConfig {
  capture_x: number
  capture_y: number
  capture_w: number
  capture_h: number
  idle_mode: RearViewIdleMode
}

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
  purpose: DevicePurpose    // defaults to 'dash'
  purposeConfig?: RearViewConfig // purpose-specific config (rear_view: capture region + idle mode)
  bindings?: DeviceBinding[]
}

export interface DetectedScreen {
  vid: number
  pid: number
  serial: string
  width: number
  height: number
  description: string
  driver: DriverType
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
  purpose: DevicePurpose
  bindings: DeviceBinding[]
}

export interface ConfigDef {
  key: string
  label: string
  type: 'select' | 'number' | 'boolean' | 'text'
  options?: { value: string; label: string }[]
  default: string
}

// ── Widget element types (mirrors app/internal/dashboard/widgets/elements.go) ─

export type ElementKind = 'panel' | 'text' | 'dot' | 'hbar' | 'deltabar' | 'segbar' | 'grid' | 'condition'
export type FontStyle  = 'label' | 'bold' | 'number' | 'mono'

// 0 = Start/left/top, 1 = Center, 2 = End/right/bottom
export type HAlign = 0 | 1 | 2
export type VAlign = 0 | 1 | 2

export interface ColorWhen {
  binding: string
  above?: number
  equals?: number
  ref: ColorRef
}

export interface ColorExpr {
  ref?:        ColorRef
  dynamicRef?: string
  when?:       ColorWhen[]
}

export interface SegColorStop {
  at:    number
  color: ColorRef
}

export interface WidgetElement {
  kind: ElementKind
  // panel
  cornerR?:   number
  fillColor?: ColorRef
  fillAlpha?: number
  noBorder?:  boolean
  // text
  text?:      string
  binding?:   string
  format?:    string
  font?:      FontStyle
  fontScale?: number
  zone?:      string
  x?:         number
  y?:         number
  hAlign?:    HAlign
  vAlign?:    VAlign
  color?:     ColorExpr
  // dot
  dotX?: number
  dotY?: number
  dotR?: number
  // hbar / deltabar
  barBinding?:  string
  barX?:        number
  barY?:        number
  barW?:        number
  barH?:        number
  barCentered?: boolean
  barColor?:    ColorExpr
  bgColor?:     ColorRef
  // deltabar
  maxDelta?: number
  posColor?: ColorExpr
  negColor?: ColorExpr
  // segbar
  segBinding?: string
  segments?:   number
  segStops?:   SegColorStop[]
  // condition
  condBinding?: string
  condAbove?:   number
  then?:        WidgetElement[]
  else?:        WidgetElement[]
  // grid
  gridRows?:  number
  gridCols?:  number
  gridGap?:   number
  gridLines?: boolean
  gridCells?: GridCell[]
}

export interface GridCell {
  label?:      string
  binding?:    string
  format?:     string
  color?:      ColorExpr
  labelColor?: ColorExpr
  colorFn?:    string
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
  panel?: PanelConfig
  header?: HeaderConfig
  defaultPanelRules?: ConditionalRule[]
  defaultDefinition?: WidgetElement[]
}

export interface PanelConfig {
  disabled?: boolean
  cornerR?:  number
  noBorder?: boolean
}

export interface HeaderConfig {
  disabled?:  boolean
  text?:      string
  align?:     HAlign
  fontScale?: number
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
    id:         String(r.id      ?? r.ID      ?? ''),
    type:       String(r.type    ?? r.Type    ?? ''),
    col:        Number(r.col     ?? r.Col     ?? 0),
    row:        Number(r.row     ?? r.Row     ?? 0),
    colSpan:    Number(r.colSpan ?? r.ColSpan ?? 1),
    rowSpan:    Number(r.rowSpan ?? r.RowSpan ?? 1),
    config:     (r.config ?? r.Config) as Record<string, unknown> | undefined,
    panelRules: (r.panelRules ?? r.PanelRules) as ConditionalRule[] | undefined,
    style:      (r.style ?? r.Style) as WidgetStyle | undefined,
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

function normRGBA(raw: unknown): RGBAColor | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const R = Number(r.R ?? r.r ?? 0)
  const G = Number(r.G ?? r.g ?? 0)
  const B = Number(r.B ?? r.b ?? 0)
  const A = Number(r.A ?? r.a ?? 255)
  return { R, G, B, A }
}

function normDashTheme(raw: unknown): DashTheme | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const primary = normRGBA(r.primary ?? r.Primary)
  if (!primary) return undefined
  return {
    primary,
    accent:  normRGBA(r.accent  ?? r.Accent)  ?? { R: 90,  G: 248, B: 251, A: 255 },
    fg:      normRGBA(r.fg      ?? r.Fg)      ?? { R: 255, G: 255, B: 255, A: 255 },
    muted:   normRGBA(r.muted   ?? r.Muted)   ?? { R: 128, G: 128, B: 128, A: 255 },
    muted2:  normRGBA(r.muted2  ?? r.Muted2)  ?? { R: 161, G: 161, B: 170, A: 255 },
    success: normRGBA(r.success ?? r.Success) ?? { R: 52,  G: 211, B: 153, A: 255 },
    warning: normRGBA(r.warning ?? r.Warning) ?? { R: 251, G: 191, B: 36,  A: 255 },
    danger:  normRGBA(r.danger  ?? r.Danger)  ?? { R: 248, G: 113, B: 113, A: 255 },
    surface: normRGBA(r.surface ?? r.Surface) ?? { R: 20,  G: 20,  B: 20,  A: 255 },
    bg:      normRGBA(r.bg      ?? r.Bg)      ?? { R: 10,  G: 10,  B: 10,  A: 255 },
    border:  normRGBA(r.border  ?? r.Border)  ?? { R: 42,  G: 42,  B: 42,  A: 255 },
    rpmRed:  normRGBA(r.rpmRed  ?? r.RPMRed  ?? r.RpmRed) ?? { R: 220, G: 38, B: 38, A: 255 },
  }
}

function normAlertInstances(raw: unknown): AlertInstance[] {
  if (!Array.isArray(raw)) return []
  return raw.map((r: unknown): AlertInstance => {
    const e = (r ?? {}) as Record<string, unknown>
    return {
      id:     String(e.id     ?? e.ID     ?? ''),
      type:   String(e.type   ?? e.Type   ?? ''),
      config: (e.config ?? e.Config) as Record<string, unknown> | undefined,
    }
  })
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
    alerts:              normAlertInstances(r.alerts ?? r.Alerts),
    theme:               normDashTheme(r.theme ?? r.Theme),
    domainPalette:       (r.domainPalette ?? r.DomainPalette) as DomainPalette | undefined,
    formatPreferences:   (r.formatPreferences ?? r.FormatPreferences) as FormatPreferences | undefined,
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
    vid:           Number(r.vid      ?? r.VID      ?? 0),
    pid:           Number(r.pid      ?? r.PID      ?? 0),
    serial:        String(r.serial   ?? r.Serial   ?? ''),
    type:          (r.type ?? r.Type ?? '') as DeviceType | '',
    width:         Number(r.width    ?? r.Width    ?? 0),
    height:        Number(r.height   ?? r.Height   ?? 0),
    name:          String(r.name     ?? r.Name     ?? ''),
    rotation:      Number(r.rotation ?? r.Rotation ?? 0),
    offsetX:       Number(r.offset_x  ?? r.offsetX  ?? r.OffsetX  ?? 0),
    offsetY:       Number(r.offset_y  ?? r.offsetY  ?? r.OffsetY  ?? 0),
    driver:        (r.driver ?? r.Driver ?? 'vocore') as DriverType,
    dashId:        String(r.dash_id  ?? r.DashID   ?? r.dashId ?? ''),
    purpose:       ((r.purpose ?? r.Purpose ?? 'dash') as DevicePurpose) || 'dash',
    purposeConfig: (r.purpose_config ?? r.PurposeConfig ?? r.purposeConfig) as RearViewConfig | undefined,
    bindings:      Array.isArray(r.bindings ?? r.Bindings)
      ? (r.bindings ?? r.Bindings) as DeviceBinding[]
      : [],
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
    purpose:     ((r.purpose ?? r.Purpose ?? 'dash') as DevicePurpose) || 'dash',
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

  startPreview(layout: DashLayout, pageIndex: number, idle: boolean): void {
    call<void>('DashStartPreview', layout, pageIndex, idle).catch(err =>
      console.error('[dash] startPreview failed:', err)
    )
  },

  stopPreview(): void {
    call<void>('DashStopPreview').catch(err =>
      console.error('[dash] stopPreview failed:', err)
    )
  },

  updatePreview(layout: DashLayout, pageIndex: number, idle: boolean): void {
    call<void>('DashUpdatePreview', layout, pageIndex, idle).catch(err =>
      console.error('[dash] updatePreview failed:', err)
    )
  },

  async getGlobalSettings(): Promise<GlobalDashSettings> {
    const raw = await call<unknown>('DashGetGlobalSettings')
    const r = raw as Record<string, unknown>
    const theme = normDashTheme(r.theme ?? r.Theme)
    const defaultTheme: DashTheme = {
      primary: { R: 255, G: 144, B: 108, A: 255 },
      accent:  { R: 90,  G: 248, B: 251, A: 255 },
      fg:      { R: 255, G: 255, B: 255, A: 255 },
      muted:   { R: 128, G: 128, B: 128, A: 255 },
      muted2:  { R: 161, G: 161, B: 170, A: 255 },
      success: { R: 52,  G: 211, B: 153, A: 255 },
      warning: { R: 251, G: 191, B: 36,  A: 255 },
      danger:  { R: 248, G: 113, B: 113, A: 255 },
      surface: { R: 20,  G: 20,  B: 20,  A: 255 },
      bg:      { R: 10,  G: 10,  B: 10,  A: 255 },
      border:  { R: 42,  G: 42,  B: 42,  A: 255 },
      rpmRed:  { R: 220, G: 38,  B: 38,  A: 255 },
    }
    return {
      theme: theme ?? defaultTheme,
      domainPalette:     (r.domainPalette ?? r.DomainPalette ?? {}) as DomainPalette,
      formatPreferences: (r.formatPreferences ?? r.FormatPreferences) as FormatPreferences | undefined,
    }
  },

  async saveGlobalSettings(s: GlobalDashSettings): Promise<void> {
    await call<void>('DashSaveGlobalSettings', s)
  },

  async getDefaultTheme(): Promise<DashTheme> {
    const raw = await call<unknown>('DashGetDefaultTheme')
    return normDashTheme(raw) ?? {
      primary: { R: 255, G: 144, B: 108, A: 255 },
      accent:  { R: 90,  G: 248, B: 251, A: 255 },
      fg:      { R: 255, G: 255, B: 255, A: 255 },
      muted:   { R: 128, G: 128, B: 128, A: 255 },
      muted2:  { R: 161, G: 161, B: 170, A: 255 },
      success: { R: 52,  G: 211, B: 153, A: 255 },
      warning: { R: 251, G: 191, B: 36,  A: 255 },
      danger:  { R: 248, G: 113, B: 113, A: 255 },
      surface: { R: 20,  G: 20,  B: 20,  A: 255 },
      bg:      { R: 10,  G: 10,  B: 10,  A: 255 },
      border:  { R: 42,  G: 42,  B: 42,  A: 255 },
      rpmRed:  { R: 220, G: 38,  B: 38,  A: 255 },
    }
  },

  async getDefaultDomainPalette(): Promise<DomainPalette> {
    const raw = await call<unknown>('DashGetDefaultDomainPalette')
    return (raw ?? {}) as DomainPalette
  },

  async getDefaultFormatPreferences(): Promise<FormatPreferences> {
    const raw = await call<unknown>('DashGetDefaultFormatPreferences')
    return (raw ?? {}) as FormatPreferences
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

  async scanUnregistered(catalogID: string): Promise<DetectedScreen[]> {
    const raw = await call<unknown[]>('DeviceScanUnregistered', catalogID)
    return Array.isArray(raw) ? raw.map(normDetectedScreen) : []
  },

  async addScanned(catalogID: string, vid: number, pid: number, serial: string): Promise<void> {
    await call<void>('DeviceAddScanned', catalogID, vid, pid, serial)
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

  async setDeviceDisabled(deviceID: string, disabled: boolean): Promise<void> {
    await call<void>('DeviceSetDeviceDisabled', deviceID, disabled)
  },

  async getDeviceDisabled(deviceID: string): Promise<boolean> {
    try {
      return await call<boolean>('DeviceGetDeviceDisabled', deviceID)
    } catch {
      return false
    }
  },

  async setDevicePurpose(vid: number, pid: number, serial: string, purpose: DevicePurpose): Promise<void> {
    await call<void>('DeviceSetPurpose', vid, pid, serial, purpose)
  },

  async setDevicePurposeConfig(vid: number, pid: number, serial: string, config: Partial<RearViewConfig>): Promise<void> {
    await call<void>('DeviceSetPurposeConfig', vid, pid, serial, JSON.stringify(config))
  },

  async selectCaptureRegion(vid: number, pid: number, serial: string): Promise<void> {
    await call<void>('DeviceSelectCaptureRegion', vid, pid, serial)
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
        defaultColSpan:      Number(e.defaultColSpan ?? e.DefaultColSpan ?? 4),
        defaultRowSpan:      Number(e.defaultRowSpan ?? e.DefaultRowSpan ?? 2),
        idleCapable:         Boolean(e.idleCapable ?? e.IdleCapable ?? false),
        defaultPanelRules:   Array.isArray(e.defaultPanelRules ?? e.DefaultPanelRules)
          ? (e.defaultPanelRules ?? e.DefaultPanelRules) as ConditionalRule[]
          : undefined,
        defaultDefinition: Array.isArray(e.defaultDefinition ?? e.DefaultDefinition)
          ? (e.defaultDefinition ?? e.DefaultDefinition) as WidgetElement[]
          : undefined,
      }
    })
  },

  async getWidgetPreview(widgetType: string, colSpan: number, rowSpan: number): Promise<string> {
    return call<string>('GetWidgetPreview', widgetType, colSpan, rowSpan)
  },
}

// Alert catalog API.

export const alertCatalogAPI = {
  async getAlertCatalog(): Promise<AlertMeta[]> {
    const raw = await call<unknown[]>('GetAlertCatalog')
    if (!Array.isArray(raw)) return []
    return raw.map((r: unknown): AlertMeta => {
      const e = r as Record<string, unknown>
      return {
        type:         String(e.type        ?? e.Type        ?? ''),
        label:        String(e.label       ?? e.Label       ?? ''),
        description:  String(e.description ?? e.Description ?? ''),
        defaultColor: String(e.defaultColor ?? e.DefaultColor ?? ''),
        configDefs: Array.isArray(e.configDefs ?? e.ConfigDefs)
          ? (e.configDefs ?? e.ConfigDefs) as ConfigDef[]
          : undefined,
      }
    })
  },
}
