import type {
  AlertInstance,
  AlertMeta,
  CatalogEntry,
  DashLayout,
  DashPage,
  DashTheme,
  DashWidget,
  DetectedScreen,
  DeviceBinding,
  DevicePurpose,
  DeviceType,
  DomainPalette,
  FormatPreferences,
  GlobalDashSettings,
  LayoutMeta,
  RearViewConfig,
  SavedDevice,
  WidgetCatalogEntry,
  WidgetStyle,
} from './types.ts'
import { DEFAULT_DASH_THEME } from './defaults.ts'

type RawRecord = Record<string, unknown>

interface RawRearViewConfig {
  capture_x?: number
  capture_y?: number
  capture_w?: number
  capture_h?: number
  idle_mode?: 'black' | 'clock'
}

interface RawDeviceBinding {
  button?: number
  command?: string
}

interface RawSavedDevice {
  vid?: number
  pid?: number
  serial?: string
  type?: DeviceType | ''
  width?: number
  height?: number
  name?: string
  rotation?: number
  target_fps?: number
  offset_x?: number
  offset_y?: number
  margin?: number
  driver?: SavedDevice['driver']
  dash_id?: string
  purpose?: DevicePurpose
  purpose_config?: RawRearViewConfig
  bindings?: RawDeviceBinding[]
  disabled?: boolean
}

interface RawCatalogEntry {
  id?: string
  name?: string
  description?: string
  type?: DeviceType
  vid?: number
  pid?: number
  width?: number
  height?: number
  rotation?: number
  offset_x?: number
  offset_y?: number
  margin?: number
  driver?: CatalogEntry['driver']
  purpose?: DevicePurpose
  bindings?: RawDeviceBinding[]
}

interface RawDetectedScreen {
  vid?: number
  pid?: number
  serial?: string
  width?: number
  height?: number
  description?: string
  driver?: DetectedScreen['driver']
}

function adaptBindings(raw: RawDeviceBinding[] | undefined): DeviceBinding[] {
  if (!Array.isArray(raw)) return []

  return raw.map(binding => ({
    button: Number(binding.button ?? 0),
    command: String(binding.command ?? ''),
  }))
}

function adaptRearViewConfig(raw: RawRearViewConfig | undefined): RearViewConfig | undefined {
  if (!raw) return undefined

  return {
    captureX: Number(raw.capture_x ?? 0),
    captureY: Number(raw.capture_y ?? 0),
    captureW: Number(raw.capture_w ?? 0),
    captureH: Number(raw.capture_h ?? 0),
    idleMode: raw.idle_mode ?? 'black',
  }
}

export function toRawRearViewConfig(config: Partial<RearViewConfig>): RawRearViewConfig {
  return {
    capture_x: config.captureX,
    capture_y: config.captureY,
    capture_w: config.captureW,
    capture_h: config.captureH,
    idle_mode: config.idleMode,
  }
}

export function encodePurposeConfig(config: Partial<RearViewConfig>): number[] {
  return Array.from(new TextEncoder().encode(JSON.stringify(toRawRearViewConfig(config))))
}

export function adaptSavedDevice(raw: RawSavedDevice): SavedDevice {
  return {
    vid: Number(raw.vid ?? 0),
    pid: Number(raw.pid ?? 0),
    serial: String(raw.serial ?? ''),
    type: (raw.type ?? '') as DeviceType | '',
    width: Number(raw.width ?? 0),
    height: Number(raw.height ?? 0),
    name: String(raw.name ?? ''),
    rotation: Number(raw.rotation ?? 0),
    targetFps: Number(raw.target_fps ?? 0),
    offsetX: Number(raw.offset_x ?? 0),
    offsetY: Number(raw.offset_y ?? 0),
    margin: Number(raw.margin ?? 0),
    driver: (raw.driver ?? 'vocore') as SavedDevice['driver'],
    dashId: String(raw.dash_id ?? ''),
    purpose: ((raw.purpose ?? 'dash') as DevicePurpose) || 'dash',
    purposeConfig: adaptRearViewConfig(raw.purpose_config),
    bindings: adaptBindings(raw.bindings),
    disabled: Boolean(raw.disabled ?? false),
  }
}

export function adaptCatalogEntry(raw: RawCatalogEntry): CatalogEntry {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    description: String(raw.description ?? ''),
    type: (raw.type ?? 'screen') as DeviceType,
    vid: Number(raw.vid ?? 0),
    pid: Number(raw.pid ?? 0),
    width: Number(raw.width ?? 0),
    height: Number(raw.height ?? 0),
    rotation: Number(raw.rotation ?? 0),
    offsetX: Number(raw.offset_x ?? 0),
    offsetY: Number(raw.offset_y ?? 0),
    margin: Number(raw.margin ?? 0),
    driver: (raw.driver ?? 'vocore') as CatalogEntry['driver'],
    purpose: ((raw.purpose ?? 'dash') as DevicePurpose) || 'dash',
    bindings: adaptBindings(raw.bindings),
  }
}

export function adaptDetectedScreen(raw: RawDetectedScreen): DetectedScreen {
  return {
    vid: Number(raw.vid ?? 0),
    pid: Number(raw.pid ?? 0),
    serial: String(raw.serial ?? ''),
    width: Number(raw.width ?? 0),
    height: Number(raw.height ?? 0),
    description: String(raw.description ?? ''),
    driver: (raw.driver ?? 'vocore') as DetectedScreen['driver'],
  }
}

function adaptWidget(raw: RawRecord): DashWidget {
  return {
    id: String(raw.id ?? ''),
    type: String(raw.type ?? ''),
    col: Number(raw.col ?? 0),
    row: Number(raw.row ?? 0),
    colSpan: Number(raw.colSpan ?? 1),
    rowSpan: Number(raw.rowSpan ?? 1),
    config: raw.config as Record<string, unknown> | undefined,
    panelRules: raw.panelRules as DashWidget['panelRules'],
    style: raw.style as WidgetStyle | undefined,
  }
}

function adaptPage(raw: RawRecord): DashPage {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    widgets: Array.isArray(raw.widgets)
      ? raw.widgets.map(widget => adaptWidget(widget as RawRecord))
      : [],
  }
}

function adaptTheme(raw: unknown): DashTheme | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  return raw as DashTheme
}

export function adaptLayout(raw: RawRecord): DashLayout {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    default: Boolean(raw.default ?? false),
    gridCols: Number(raw.gridCols ?? 20),
    gridRows: Number(raw.gridRows ?? 12),
    idlePage: raw.idlePage && typeof raw.idlePage === 'object'
      ? adaptPage(raw.idlePage as RawRecord)
      : { id: '', name: 'Idle', widgets: [] },
    pages: Array.isArray(raw.pages)
      ? raw.pages.map(page => adaptPage(page as RawRecord))
      : [],
    alerts: (raw.alerts as AlertInstance[] | undefined) ?? [],
    theme: adaptTheme(raw.theme),
    domainPalette: raw.domainPalette as DomainPalette | undefined,
    formatPreferences: raw.formatPreferences as FormatPreferences | undefined,
  }
}

export function adaptLayoutMeta(raw: RawRecord): LayoutMeta {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    default: Boolean(raw.default ?? false),
    pageCount: Number(raw.pageCount ?? 0),
    gridCols: Number(raw.gridCols ?? 20),
    gridRows: Number(raw.gridRows ?? 12),
    previewAvailable: Boolean(raw.previewAvailable ?? false),
  }
}

export function adaptGlobalDashSettings(raw: RawRecord): GlobalDashSettings {
  return {
    theme: adaptTheme(raw.theme) ?? DEFAULT_DASH_THEME,
    domainPalette: (raw.domainPalette as DomainPalette | undefined) ?? {},
    formatPreferences: raw.formatPreferences as FormatPreferences | undefined,
  }
}

export function adaptWidgetCatalogEntry(raw: RawRecord): WidgetCatalogEntry {
  return {
    type: String(raw.type ?? ''),
    name: String(raw.name ?? ''),
    category: String(raw.category ?? ''),
    categoryLabel: String(raw.categoryLabel ?? raw.category ?? ''),
    configDefs: raw.configDefs as WidgetCatalogEntry['configDefs'],
    defaultColSpan: Number(raw.defaultColSpan ?? 4),
    defaultRowSpan: Number(raw.defaultRowSpan ?? 2),
    idleCapable: Boolean(raw.idleCapable ?? false),
    panel: raw.panel as WidgetCatalogEntry['panel'],
    label: raw.label as WidgetCatalogEntry['label'],
    defaultPanelRules: raw.defaultPanelRules as WidgetCatalogEntry['defaultPanelRules'],
    defaultDefinition: raw.defaultDefinition as WidgetCatalogEntry['defaultDefinition'],
  }
}

export function adaptAlertMeta(raw: RawRecord): AlertMeta {
  return {
    type: String(raw.type ?? ''),
    label: String(raw.label ?? ''),
    description: String(raw.description ?? ''),
    defaultColor: String(raw.defaultColor ?? ''),
    configDefs: raw.configDefs as AlertMeta['configDefs'],
  }
}
