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
  abs?: RGBAColor
  tc?: RGBAColor
  brakeBias?: RGBAColor
  energy?: RGBAColor
  motor?: RGBAColor
  brakeMig?: RGBAColor
}

export interface DashTheme {
  primary: RGBAColor
  accent: RGBAColor
  fg: RGBAColor
  muted: RGBAColor
  muted2: RGBAColor
  success: RGBAColor
  warning: RGBAColor
  danger: RGBAColor
  surface: RGBAColor
  bg: RGBAColor
  border: RGBAColor
  rpmRed: RGBAColor
}

export interface GlobalDashSettings {
  theme: DashTheme
  domainPalette: DomainPalette
  formatPreferences?: FormatPreferences
}

export interface WidgetStyle {
  font?: FontStyle
  fontSize?: number
  textColor?: RGBAColor
  labelColor?: RGBAColor
  labelFont?: FontStyle
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
  config?: Record<string, unknown>
  panelRules?: ConditionalRule[]
  style?: WidgetStyle
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
  alerts: AlertInstance[]
  theme?: DashTheme
  domainPalette?: DomainPalette
  formatPreferences?: FormatPreferences
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
export type ScreenStatus = 'connected' | 'disconnected' | 'unknown'

export interface RearViewConfig {
  captureX: number
  captureY: number
  captureW: number
  captureH: number
  idleMode: RearViewIdleMode
}

export interface DeviceBinding {
  button: number
  command: string
}

export interface SavedDevice {
  vid: number
  pid: number
  serial: string
  type: DeviceType | ''
  width: number
  height: number
  name: string
  rotation: number
  targetFps: number
  offsetX: number
  offsetY: number
  margin: number
  driver: DriverType
  dashId: string
  purpose: DevicePurpose
  purposeConfig?: RearViewConfig
  bindings: DeviceBinding[]
  disabled: boolean
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
  offsetX: number
  offsetY: number
  margin: number
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

export type ElementKind = 'panel' | 'text' | 'dot' | 'hbar' | 'deltabar' | 'segbar' | 'grid' | 'condition'
export type FontStyle = 'label' | 'bold' | 'number' | 'mono'
export type HAlign = 0 | 1 | 2
export type VAlign = 0 | 1 | 2

export interface ColorWhen {
  binding: string
  above?: number
  equals?: number
  ref: ColorRef
}

export interface ColorExpr {
  ref?: ColorRef
  dynamicRef?: string
  when?: ColorWhen[]
}

export interface SegColorStop {
  at: number
  color: ColorRef
}

export interface WidgetElement {
  kind: ElementKind
  cornerR?: number
  fillColor?: ColorRef
  fillAlpha?: number
  noBorder?: boolean
  text?: string
  binding?: string
  format?: string
  font?: FontStyle
  fontScale?: number
  zone?: string
  x?: number
  y?: number
  hAlign?: HAlign
  vAlign?: VAlign
  color?: ColorExpr
  dotX?: number
  dotY?: number
  dotR?: number
  barBinding?: string
  barX?: number
  barY?: number
  barW?: number
  barH?: number
  barCentered?: boolean
  barColor?: ColorExpr
  bgColor?: ColorRef
  maxDelta?: number
  posColor?: ColorExpr
  negColor?: ColorExpr
  segBinding?: string
  segments?: number
  segStops?: SegColorStop[]
  condBinding?: string
  condAbove?: number
  then?: WidgetElement[]
  else?: WidgetElement[]
  gridRows?: number
  gridCols?: number
  gridGap?: number
  gridLines?: boolean
  gridCells?: GridCell[]
}

export interface GridCell {
  label?: string
  binding?: string
  format?: string
  color?: ColorExpr
  labelColor?: ColorExpr
  colorFn?: string
}

export interface WidgetCatalogEntry {
  type: string
  name: string
  category: string
  categoryLabel: string
  configDefs?: ConfigDef[]
  defaultColSpan: number
  defaultRowSpan: number
  idleCapable: boolean
  panel?: PanelConfig
  label?: LabelConfig
  defaultPanelRules?: ConditionalRule[]
  defaultDefinition?: WidgetElement[]
}

export interface PanelConfig {
  disabled?: boolean
  cornerR?: number
  noBorder?: boolean
}

export interface LabelConfig {
  hidden?: boolean
  text?: string
  align?: HAlign
  fontScale?: number
  vAlign?: VAlign
}

export function deviceHasScreen(type: DeviceType | ''): boolean {
  return type === 'wheel' || type === 'screen' || type === ''
}

export function deviceID(vid: number, pid: number, serial: string): string {
  const v = vid.toString(16).padStart(4, '0')
  const p = pid.toString(16).padStart(4, '0')
  return serial ? `${v}-${p}-${serial}` : `${v}-${p}`
}
