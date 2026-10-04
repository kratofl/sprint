import type { SprintCommand } from '../bridge'
import { dashboardWidgetTypes, isDashWidgetType, styleColorTokens, dashAlertTypes, type DashAlertType } from '@sprint/dashboard'
import type { DashAlert, DashColorSystem, DashLayout, DashPage, DashTheme, DashWidget, DashWidgetStack, DashWidgetStackLayer, DashWidgetStyle, DashWidgetType } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'

/**
 * Dashes domain model, parsing, and layout mutators.
 *
 * The page/widget/stack mutators below are a hand-mirrored copy of
 * `app/Sprint.Desktop.Core/Features/Dashes/DashLayoutEditor.cs` and
 * `DashEditorController.cs` — the same convention DevicesDomain.ts uses for
 * the hardware catalogs. If those files change, this file must change with
 * them. `RuntimeCoordinator` has no per-field dash-editing commands: every
 * mutator below produces a new, locally-valid `DashLayout` that the view sends
 * whole via `dash.save` (see the command builders at the bottom), mirroring how
 * `DashEditorController.cs` mutates its in-memory layout before persisting.
 *
 * The widget-type catalog and alert-type catalog are each hand-mirrored too,
 * but from different (and differently-durable) sources — see the comments at
 * `WIDGET_CATALOG` and `AlertTypeId` below for what each one still needs to
 * stay in sync with, and why neither is read from published host state yet.
 */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

// ── Parsing (SprintState.dashLayouts -> DashLayout) ─────────────────────────

function isDashWidgetRow(value: unknown): value is DashWidget {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.col === 'number' &&
    typeof value.row === 'number' &&
    typeof value.colSpan === 'number' &&
    typeof value.rowSpan === 'number'
  )
}

function isDashWidgetStackLayerRow(value: unknown): value is DashWidgetStackLayer {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.widgets) && value.widgets.every(isDashWidgetRow)
}

function isDashWidgetStackRow(value: unknown): value is DashWidgetStack {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.col === 'number' &&
    typeof value.row === 'number' &&
    typeof value.colSpan === 'number' &&
    typeof value.rowSpan === 'number' &&
    Array.isArray(value.layers) &&
    value.layers.every(isDashWidgetStackLayerRow)
  )
}

function isDashPageRow(value: unknown): value is DashPage {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !Array.isArray(value.widgets) || !value.widgets.every(isDashWidgetRow)) {
    return false
  }

  return value.widgetStacks === undefined || (Array.isArray(value.widgetStacks) && value.widgetStacks.every(isDashWidgetStackRow))
}

function isDashAlertRow(value: unknown): value is DashAlert {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.enabled === 'boolean' &&
    typeof value.col === 'number' &&
    typeof value.row === 'number' &&
    typeof value.colSpan === 'number' &&
    typeof value.rowSpan === 'number'
  )
}

/** Parses one raw `dashLayouts[]` row. Returns `null` for a row with no id — never a fabricated dash. */
export function parseDashLayout(row: Record<string, unknown>): DashLayout | null {
  if (typeof row.id !== 'string' || row.id.length === 0) {
    return null
  }

  const layout: DashLayout = {
    id: row.id,
    name: typeof row.name === 'string' ? row.name : row.id,
    default: row.default === true,
    mode: typeof row.mode === 'string' ? row.mode : 'basic',
    gridCols: typeof row.gridCols === 'number' && row.gridCols > 0 ? row.gridCols : 20,
    gridRows: typeof row.gridRows === 'number' && row.gridRows > 0 ? row.gridRows : 12,
    pages: Array.isArray(row.pages) ? row.pages.filter(isDashPageRow) : [],
    alerts: Array.isArray(row.alerts) ? row.alerts.filter(isDashAlertRow) : [],
  }

  if (isDashPageRow(row.idlePage)) layout.idlePage = row.idlePage
  if (typeof row.screenProfile === 'string') layout.screenProfile = row.screenProfile
  if (row.colorSystem === 'functional' || row.colorSystem === 'styled') layout.colorSystem = row.colorSystem
  if (isRecord(row.theme)) {
    layout.theme = Object.fromEntries(Object.entries(row.theme).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  }
  if (isRecord(row.alertConfig)) layout.alertConfig = row.alertConfig

  return layout
}

export const parseDashLayouts = (rows: ReadonlyArray<Record<string, unknown>>): DashLayout[] => rows.map(parseDashLayout).filter((layout): layout is DashLayout => layout !== null)

function isTelemetryFrame(value: unknown): value is TelemetryFrame {
  return (
    isRecord(value) &&
    isRecord(value.session) &&
    isRecord(value.car) &&
    isRecord(value.lap) &&
    isRecord(value.flags) &&
    isRecord(value.electronics) &&
    isRecord(value.race) &&
    isRecord(value.energy)
  )
}

/** Narrows `SprintState.telemetry.frame` (an untyped record) for the live preview. `DashRenderer` treats a missing frame as "no data" on its own. */
export const toTelemetryFrame = (value: unknown): TelemetryFrame | null => (isTelemetryFrame(value) ? value : null)

// ── Screen profiles (ScreenProfile.cs / ScreenProfileCatalog) ───────────────

export type ScreenProfile = { id: string; name: string; width: number; height: number; gridCols: number; gridRows: number }

export const SCREEN_PROFILES: readonly ScreenProfile[] = [
  { id: 'landscape-800x480', name: 'Landscape 800 × 480', width: 800, height: 480, gridCols: 20, gridRows: 12 },
  { id: 'square-800x800', name: 'Square 800 × 800', width: 800, height: 800, gridCols: 16, gridRows: 16 },
  { id: 'landscape-1024x600', name: 'Landscape 1024 × 600', width: 1024, height: 600, gridCols: 24, gridRows: 14 },
  { id: 'portrait-480x854', name: 'Portrait 480 × 854', width: 480, height: 854, gridCols: 12, gridRows: 20 },
  { id: 'portrait-480x800', name: 'Portrait 480 × 800', width: 480, height: 800, gridCols: 12, gridRows: 20 },
  { id: 'portrait-720x1280', name: 'Portrait 720 × 1280', width: 720, height: 1280, gridCols: 12, gridRows: 22 },
]

export const resolveScreenProfile = (id: string | undefined | null): ScreenProfile => SCREEN_PROFILES.find((profile) => profile.id === id) ?? SCREEN_PROFILES[0]

/** The catalog profile matching a layout's own grid, for dashes saved before a screen profile was assigned. */
const matchScreenProfileToGrid = (gridCols: number, gridRows: number): ScreenProfile => {
  const exact = SCREEN_PROFILES.find((profile) => profile.gridCols === gridCols && profile.gridRows === gridRows)
  if (exact) return exact
  const aspect = gridCols / gridRows
  return [...SCREEN_PROFILES].sort((a, b) => Math.abs(a.width / a.height - aspect) - Math.abs(b.width / b.height - aspect))[0]
}

export const layoutScreenProfile = (layout: DashLayout): ScreenProfile => (layout.screenProfile ? resolveScreenProfile(layout.screenProfile) : matchScreenProfileToGrid(layout.gridCols, layout.gridRows))

/**
 * Scales a screen size down (or up) to fit inside a box, keeping its aspect ratio. Every dash
 * preview in the editor chrome (library thumbnails, the editor canvas, theme previews) uses it,
 * so a portrait dash fits the same box as a landscape one instead of growing tall.
 */
export const fitScreenSize = (screen: Pick<ScreenProfile, 'width' | 'height'>, maxWidth: number, maxHeight: number): { width: number; height: number } => {
  const scale = Math.min(maxWidth / screen.width, maxHeight / screen.height)
  return { width: Math.round(screen.width * scale), height: Math.round(screen.height * scale) }
}

// ── Widget catalog (DashWidgetCatalog.cs) — type list vs. UI metadata ───────
//
// The widget TYPE list is not hand-mirrored here: `DashWidgetType` and
// `dashboardWidgetTypes` come from `@sprint/dashboard` (packages/dashboard/src/widgets.tsx),
// which is itself the one hand-mirrored copy of `DashWidgetCatalog.cs`'s type
// list shared by every desktop-app consumer. `WIDGET_CATALOG` below is typed
// `Record<DashWidgetType, ...>`, so adding a type in the package without adding
// an entry here is a compile error — the two cannot silently drift apart.
//
// What IS still hand-mirrored below, because the host does not publish it over
// `/api/state`, is the UI-side metadata for each type (display name,
// idle-capability, config field descriptors) from `DashWidgetDefinition` in
// `app/Sprint.Desktop.Core/Features/Dashes/DashWidgetCatalog.cs`. If a
// widget's name, idle-capability, or config fields change there, update the
// matching entry in `WIDGET_CATALOG` below by hand.

export type DashConfigOption = { value: string; label: string }
export type DashConfigField = { key: string; label: string; kind: 'text' | 'select'; default: string; options: readonly DashConfigOption[] }
export type DashWidgetDefinition = { type: DashWidgetType; name: string; idleCapable: boolean; config: readonly DashConfigField[] }

const NO_CONFIG: readonly DashConfigField[] = []

const TEXT_CONFIG: readonly DashConfigField[] = [
  { key: 'content', label: 'Text', kind: 'text', default: '', options: [] },
  {
    key: 'binding',
    label: 'Live value',
    kind: 'select',
    default: '',
    options: [
      { value: '', label: 'None (static text)' },
      { value: 'profile.driverName', label: 'Driver name' },
      { value: 'profile.driverNumber', label: 'Driver number' },
      { value: 'session.track', label: 'Track' },
      { value: 'session.car', label: 'Car' },
      { value: 'car.speed', label: 'Speed (km/h)' },
      { value: 'car.gear', label: 'Gear' },
      { value: 'lap.current', label: 'Current lap time' },
      { value: 'lap.delta', label: 'Delta' },
    ],
  },
]

const VIRTUAL_ENERGY_CONFIG: readonly DashConfigField[] = [
  {
    key: 'mode',
    label: 'Display',
    kind: 'select',
    default: 'budget',
    options: [
      { value: 'budget', label: 'Budget (%, per lap, laps left)' },
      { value: 'percent', label: 'Percentage only' },
      { value: 'power', label: 'Percentage + power (kW)' },
    ],
  },
]

const ALIGN_CONFIG: readonly DashConfigField[] = [
  {
    key: 'align',
    label: 'Alignment',
    kind: 'select',
    default: 'center',
    options: [
      { value: 'center', label: 'Centre' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ],
  },
]

const TYRE_TEMP_CONFIG: readonly DashConfigField[] = [
  {
    key: 'channel',
    label: 'Reading',
    kind: 'select',
    default: 'surface',
    options: [
      { value: 'surface', label: 'Surface (tread average)' },
      { value: 'core', label: 'Core (carcass)' },
    ],
  },
]

/** UI metadata in catalog order (DashWidgetCatalog.cs — see the section comment above). `idleCapable` hides live-telemetry widgets from the idle-page palette. */
const WIDGET_CATALOG: Readonly<Record<DashWidgetType, DashWidgetDefinition>> = {
  header: { type: 'header', name: 'Header', idleCapable: true, config: NO_CONFIG },
  text: { type: 'text', name: 'Text', idleCapable: true, config: TEXT_CONFIG },
  rpm_bar: { type: 'rpm_bar', name: 'RPM Bar', idleCapable: false, config: NO_CONFIG },
  gear_speed: { type: 'gear_speed', name: 'Gear + Speed', idleCapable: true, config: ALIGN_CONFIG },
  input_trace: { type: 'input_trace', name: 'Input Trace', idleCapable: false, config: NO_CONFIG },
  sector: { type: 'sector', name: 'Sectors', idleCapable: false, config: NO_CONFIG },
  lap_time: { type: 'lap_time', name: 'Lap Time', idleCapable: false, config: NO_CONFIG },
  delta: { type: 'delta', name: 'Delta', idleCapable: false, config: NO_CONFIG },
  fuel: { type: 'fuel', name: 'Fuel', idleCapable: true, config: NO_CONFIG },
  tyre_temp: { type: 'tyre_temp', name: 'Tyre Temperature', idleCapable: true, config: TYRE_TEMP_CONFIG },
  flag: { type: 'flag', name: 'Flags', idleCapable: true, config: NO_CONFIG },
  tc: { type: 'tc', name: 'Traction Control', idleCapable: false, config: NO_CONFIG },
  abs: { type: 'abs', name: 'ABS', idleCapable: false, config: NO_CONFIG },
  engine_map: { type: 'engine_map', name: 'Engine Map', idleCapable: false, config: NO_CONFIG },
  brake_bias: { type: 'brake_bias', name: 'Brake Bias', idleCapable: false, config: NO_CONFIG },
  fuel_target: { type: 'fuel_target', name: 'Fuel Target', idleCapable: false, config: NO_CONFIG },
  position: { type: 'position', name: 'Position', idleCapable: false, config: NO_CONFIG },
  gaps: { type: 'gaps', name: 'Gaps', idleCapable: false, config: NO_CONFIG },
  predictive_lap: { type: 'predictive_lap', name: 'Predictive Lap', idleCapable: false, config: NO_CONFIG },
  racelogic_lap_timer: { type: 'racelogic_lap_timer', name: 'RaceLogic Lap Timer', idleCapable: false, config: NO_CONFIG },
  tyre_pressure: { type: 'tyre_pressure', name: 'Tyre Pressure', idleCapable: true, config: NO_CONFIG },
  virtual_energy: { type: 'virtual_energy', name: 'Virtual Energy', idleCapable: false, config: VIRTUAL_ENERGY_CONFIG },
}

/** Single source of truth for the widget type list — do not redefine it locally; see the section comment above. */
export const ALL_WIDGET_TYPES: readonly DashWidgetType[] = dashboardWidgetTypes

export const widgetDefinition = (type: string): DashWidgetDefinition | null => (isDashWidgetType(type) ? WIDGET_CATALOG[type] : null)

export const widgetDisplayName = (type: string): string => widgetDefinition(type)?.name ?? type

/**
 * Selectable widget colour tokens. `styleColorTokens` is the authoritative list,
 * exported by `@sprint/dashboard` (ported from the retired DashPalette); only the
 * human labels are this app's concern, so the values can never drift out of step.
 */
export const WIDGET_STYLE_COLOR_TOKENS: readonly { value: string; label: string }[] =
  styleColorTokens.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))

// ── Alert catalog ──
//
// `AlertTypeId` is `DashAlertType` from `@sprint/dashboard`, the authoritative
// set the tracker fires on. Only the labels below are UI copy; adding an alert
// type to the package without labelling it here is a compile error, so the two
// cannot drift silently.

export type AlertTypeId = DashAlertType

const ALERT_TYPE_LABELS: Record<AlertTypeId, string> = {
  tc_change: 'Traction control change',
  abs_change: 'ABS change',
  enginemap_change: 'Engine map change',
}

export const ALERT_TYPES: readonly { type: AlertTypeId; label: string }[] =
  dashAlertTypes.map((type) => ({ type, label: ALERT_TYPE_LABELS[type] }))

export const ALERT_COLOR_TOKENS: readonly { value: string; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'ember', label: 'Ember' },
  { value: 'ice', label: 'Ice' },
  { value: 'viper', label: 'Viper' },
  { value: 'suzuki', label: 'Suzuki' },
  { value: 'crimson', label: 'Crimson' },
  { value: 'mono', label: 'Mono' },
  { value: 'yellow', label: 'Yellow' },
]

// ── Geometry helpers (DashLayoutEditor.cs Intersects/WouldOverlap) ──────────

export type GridRect = { col: number; row: number; colSpan: number; rowSpan: number }

const rectsIntersect = (a: GridRect, b: GridRect): boolean => a.col < b.col + b.colSpan && a.col + a.colSpan > b.col && a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row

const isValidRect = (rect: GridRect, cols: number, rows: number): boolean =>
  rect.col >= 0 && rect.row >= 0 && rect.colSpan > 0 && rect.rowSpan > 0 && rect.col + rect.colSpan <= cols && rect.row + rect.rowSpan <= rows

function pageOverlaps(page: DashPage, candidate: GridRect, excludeWidgetId: string | null): boolean {
  if (page.widgets.some((widget) => widget.id !== excludeWidgetId && rectsIntersect(widget, candidate))) return true
  return (page.widgetStacks ?? []).some((stack) => rectsIntersect(stack, candidate))
}

function layerOverlaps(layer: DashWidgetStackLayer, candidate: GridRect, excludeWidgetId: string | null): boolean {
  return layer.widgets.some((widget) => widget.id !== excludeWidgetId && rectsIntersect(widget, candidate))
}

function firstFit(cols: number, rows: number, colSpan: number, rowSpan: number, occupied: (rect: GridRect) => boolean): GridRect | null {
  const cs = Math.max(1, Math.min(colSpan, cols))
  const rs = Math.max(1, Math.min(rowSpan, rows))
  for (let row = 0; row <= rows - rs; row++) {
    for (let col = 0; col <= cols - cs; col++) {
      const rect: GridRect = { col, row, colSpan: cs, rowSpan: rs }
      if (!occupied(rect)) return rect
    }
  }

  return null
}

export const DEFAULT_WIDGET_COL_SPAN = 4
export const DEFAULT_WIDGET_ROW_SPAN = 2
const DEFAULT_STACK_COL_SPAN = 6
const DEFAULT_STACK_ROW_SPAN = 4

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'page'
}

function nextId(base: string, exists: (id: string) => boolean): string {
  if (!exists(base)) return base
  for (let index = 2; ; index++) {
    const candidate = `${base}-${index}`
    if (!exists(candidate)) return candidate
  }
}

/** `{prefix}-1`, `{prefix}-2`, ... — mirrors `DashLayoutEditor.NextLayerId`'s scheme (distinct from `nextId`'s "append -2 to a taken base" scheme used for page/widget/stack ids). */
function nextSequentialId(prefix: string, exists: (id: string) => boolean): string {
  for (let index = 1; ; index++) {
    const candidate = `${prefix}-${index}`
    if (!exists(candidate)) return candidate
  }
}

function nextName(base: string, exists: (name: string) => boolean): string {
  if (!exists(base)) return base
  for (let index = 2; ; index++) {
    const candidate = `${base} ${index}`
    if (!exists(candidate)) return candidate
  }
}

function cloneLayout(layout: DashLayout): DashLayout {
  return structuredClone(layout)
}

/** Finds a page by id, checking the idle page first — mirrors `DashLayoutEditor.FindPage`. */
export function findPage(layout: DashLayout, pageId: string): DashPage | null {
  if (layout.idlePage?.id === pageId) return layout.idlePage
  return layout.pages.find((page) => page.id === pageId) ?? null
}

function findStack(page: DashPage, stackId: string): DashWidgetStack | null {
  return (page.widgetStacks ?? []).find((stack) => stack.id === stackId) ?? null
}

function findWidgetInPage(page: DashPage, widgetId: string): DashWidget | null {
  return page.widgets.find((widget) => widget.id === widgetId) ?? null
}

/** Where a selected widget lives — a page's own grid, or a widget stack's active layer sub-grid. `DashRenderer.onWidgetSelect` fires identically for both. */
export type WidgetLocation = { kind: 'page'; pageId: string } | { kind: 'stackLayer'; pageId: string; stackId: string; layerId: string }

export function findWidgetLocation(layout: DashLayout, pageId: string, widgetId: string): WidgetLocation | null {
  const page = findPage(layout, pageId)
  if (!page) return null
  if (findWidgetInPage(page, widgetId)) return { kind: 'page', pageId }
  for (const stack of page.widgetStacks ?? []) {
    for (const layer of stack.layers) {
      if (layer.widgets.some((widget) => widget.id === widgetId)) {
        return { kind: 'stackLayer', pageId, stackId: stack.id, layerId: layer.id }
      }
    }
  }

  return null
}

export function findWidgetAt(layout: DashLayout, location: WidgetLocation, widgetId: string): DashWidget | null {
  const page = findPage(layout, location.pageId)
  if (!page) return null
  if (location.kind === 'page') return findWidgetInPage(page, widgetId)
  const stack = findStack(page, location.stackId)
  const layer = stack?.layers.find((item) => item.id === location.layerId)
  return layer?.widgets.find((widget) => widget.id === widgetId) ?? null
}

// ── Page operations ──────────────────────────────────────────────────────

export function addPage(layout: DashLayout, name: string): { layout: DashLayout; page: DashPage } {
  const next = cloneLayout(layout)
  const baseName = name.trim() || 'Page'
  const idExists = (id: string) => next.idlePage?.id === id || next.pages.some((page) => page.id === id)
  const nameExists = (value: string) => next.idlePage?.name === value || next.pages.some((page) => page.name === value)
  const page: DashPage = { id: nextId(slugify(baseName), idExists), name: nextName(baseName, nameExists), widgets: [] }
  next.pages.push(page)
  return { layout: next, page }
}

export function renamePage(layout: DashLayout, pageId: string, name: string): DashLayout | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  if (!page) return null
  page.name = trimmed
  return next
}

/** Only removes a regular page (never the idle page) and never the last one — mirrors `DashLayoutEditor.TryDeletePage`. */
export function deletePage(layout: DashLayout, pageId: string): DashLayout | null {
  if (layout.pages.length <= 1 || !layout.pages.some((page) => page.id === pageId)) return null
  const next = cloneLayout(layout)
  next.pages = next.pages.filter((page) => page.id !== pageId)
  return next
}

/** Adds an idle page (`layout.idlePage` is optional — no dedicated command exists, so this is a content edit like any other, saved via `dash.save`). */
export function addIdlePage(layout: DashLayout): DashLayout | null {
  if (layout.idlePage) return null
  const next = cloneLayout(layout)
  next.idlePage = { id: 'idle', name: 'Idle', widgets: [] }
  return next
}

export function removeIdlePage(layout: DashLayout): DashLayout | null {
  if (!layout.idlePage) return null
  const next = cloneLayout(layout)
  next.idlePage = null
  return next
}

export function renameLayout(layout: DashLayout, name: string): DashLayout | null {
  const trimmed = name.trim()
  if (!trimmed || trimmed === layout.name) return null
  const next = cloneLayout(layout)
  next.name = trimmed
  return next
}

/** Applies a complete theme preset (palette override + its effective color system) to the layout — mirrors `DashEditorController.ApplyThemePreset`. "Graphite" is the empty theme, so it always resolves to `'functional'`. */
export function applyThemePreset(layout: DashLayout, theme: DashTheme, colorSystem: DashColorSystem): DashLayout {
  const next = cloneLayout(layout)
  next.theme = theme
  next.colorSystem = colorSystem
  return next
}

// ── Page widgets ─────────────────────────────────────────────────────────

/** Adds a widget at the first free grid cell — mirrors `DashLayoutEditor.TryAddWidget`. */
export function addWidget(layout: DashLayout, pageId: string, type: DashWidgetType): { layout: DashLayout; widget: DashWidget } | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  if (!page) return null

  const rect = firstFit(next.gridCols, next.gridRows, DEFAULT_WIDGET_COL_SPAN, DEFAULT_WIDGET_ROW_SPAN, (candidate) => pageOverlaps(page, candidate, null))
  if (!rect) return null

  const idExists = (id: string) => page.widgets.some((widget) => widget.id === id)
  const widget: DashWidget = { id: nextId(slugify(type.replace(/_/g, '-')), idExists), type, ...rect }
  page.widgets.push(widget)
  return { layout: next, widget }
}

/** Non-mutating placement check for a not-yet-created widget (palette drag ghost) — mirrors `DashLayoutEditor.CanPlaceNewWidget`. */
export function canPlaceNewWidget(layout: DashLayout, pageId: string, rect: GridRect): boolean {
  const page = findPage(layout, pageId)
  if (!page || !isValidRect(rect, layout.gridCols, layout.gridRows)) return false
  return !pageOverlaps(page, rect, null)
}

/** Adds a widget at an explicit grid cell (drag-drop placement) — mirrors `DashLayoutEditor.TryAddWidgetAt`. The requested cell is clamped in-bounds; placement is rejected (no fallback) if it would overlap, so a drop onto an occupied cell fails rather than silently jumping. */
export function addWidgetAt(layout: DashLayout, pageId: string, type: DashWidgetType, col: number, row: number): { layout: DashLayout; widget: DashWidget } | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  if (!page) return null

  const colSpan = Math.min(DEFAULT_WIDGET_COL_SPAN, next.gridCols)
  const rowSpan = Math.min(DEFAULT_WIDGET_ROW_SPAN, next.gridRows)
  const rect: GridRect = { col: Math.max(0, Math.min(col, next.gridCols - colSpan)), row: Math.max(0, Math.min(row, next.gridRows - rowSpan)), colSpan, rowSpan }
  if (pageOverlaps(page, rect, null)) return null

  const idExists = (id: string) => page.widgets.some((widget) => widget.id === id)
  const widget: DashWidget = { id: nextId(slugify(type.replace(/_/g, '-')), idExists), type, ...rect }
  page.widgets.push(widget)
  return { layout: next, widget }
}

/** Non-mutating placement check for an existing widget being moved/resized (drag ghost) — mirrors `DashLayoutEditor.CanPlaceWidget`. Works for a page widget or a widget-stack layer's own widget, bounded by whichever grid it lives in. */
export function canPlaceWidgetAt(layout: DashLayout, location: WidgetLocation, widgetId: string, rect: GridRect): boolean {
  const page = findPage(layout, location.pageId)
  if (!page) return false

  if (location.kind === 'page') {
    return findWidgetInPage(page, widgetId) !== null && isValidRect(rect, layout.gridCols, layout.gridRows) && !pageOverlaps(page, rect, widgetId)
  }

  const stack = findStack(page, location.stackId)
  const layer = stack?.layers.find((item) => item.id === location.layerId)
  if (!stack || !layer) return false
  return isValidRect(rect, Math.max(1, stack.colSpan), Math.max(1, stack.rowSpan)) && !layerOverlaps(layer, rect, widgetId)
}

export type ResizeHandle = { hx: -1 | 0 | 1; hy: -1 | 0 | 1 }

/** Snaps a pointer-drag delta (in whole grid cells) onto a moved widget's rectangle, clamped to the grid — mirrors the old Avalonia editor's `PreviewGeometry` move branch. Pure pixel/grid math shared by the widget canvas and the alert canvas. */
export function previewMoveRect(start: GridRect, deltaCol: number, deltaRow: number, cols: number, rows: number): GridRect {
  const col = Math.max(0, Math.min(start.col + deltaCol, Math.max(0, cols - start.colSpan)))
  const row = Math.max(0, Math.min(start.row + deltaRow, Math.max(0, rows - start.rowSpan)))
  return { col, row, colSpan: start.colSpan, rowSpan: start.rowSpan }
}

/** Snaps a pointer-drag delta onto a resized widget's rectangle for one of 8 edge/corner handles (or the alert canvas's single bottom-right handle), clamped to the grid and to a minimum span of one cell — mirrors the old editor's `ResizeGeometry`. */
export function previewResizeRect(start: GridRect, handle: ResizeHandle, deltaCol: number, deltaRow: number, cols: number, rows: number): GridRect {
  let { col, row, colSpan, rowSpan } = start
  if (handle.hx > 0) {
    colSpan = Math.max(1, Math.min(start.colSpan + deltaCol, Math.max(1, cols - start.col)))
  } else if (handle.hx < 0) {
    col = Math.max(0, Math.min(start.col + deltaCol, start.col + start.colSpan - 1))
    colSpan = start.col + start.colSpan - col
  }
  if (handle.hy > 0) {
    rowSpan = Math.max(1, Math.min(start.rowSpan + deltaRow, Math.max(1, rows - start.row)))
  } else if (handle.hy < 0) {
    row = Math.max(0, Math.min(start.row + deltaRow, start.row + start.rowSpan - 1))
    rowSpan = start.row + start.rowSpan - row
  }
  return { col, row, colSpan, rowSpan }
}

/** Sets a page widget's full geometry in one step (numeric grid inspector) — mirrors `DashLayoutEditor.TrySetWidgetGeometry`. */
export function setWidgetGeometry(layout: DashLayout, pageId: string, widgetId: string, rect: GridRect): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const widget = page && findWidgetInPage(page, widgetId)
  if (!page || !widget || !isValidRect(rect, next.gridCols, next.gridRows) || pageOverlaps(page, rect, widgetId)) return null
  Object.assign(widget, rect)
  return next
}

export function clearPage(layout: DashLayout, pageId: string): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  if (!page) return null
  page.widgets = []
  page.widgetStacks = []
  return next
}

// ── Widget config / style (shared by page widgets and stack-layer widgets) ─

function withWidget(layout: DashLayout, location: WidgetLocation, widgetId: string, mutate: (widget: DashWidget) => void): DashLayout | null {
  const next = cloneLayout(layout)
  const widget = findWidgetAt(next, location, widgetId)
  if (!widget) return null
  mutate(widget)
  return next
}

/** Sets (or clears, when blank) a string config value — mirrors `DashEditorController.SetSelectedConfig`. */
export function setWidgetConfig(layout: DashLayout, location: WidgetLocation, widgetId: string, key: string, value: string): DashLayout | null {
  return withWidget(layout, location, widgetId, (widget) => {
    const config = { ...(widget.config ?? {}) }
    if (value.length === 0) delete config[key]
    else config[key] = value
    widget.config = Object.keys(config).length > 0 ? config : undefined
  })
}

export function setWidgetStyle(layout: DashLayout, location: WidgetLocation, widgetId: string, patch: Partial<DashWidgetStyle>): DashLayout | null {
  return withWidget(layout, location, widgetId, (widget) => {
    const style: DashWidgetStyle = { ...(widget.style ?? {}), ...patch }
    widget.style = style.textColor || style.labelColor || style.border !== undefined ? style : undefined
  })
}

/** Sets a stack-layer widget's geometry within its stack's own local sub-grid — mirrors the page-widget version, bounded by the stack instead of the page. */
export function setStackLayerWidgetGeometry(layout: DashLayout, pageId: string, stackId: string, layerId: string, widgetId: string, rect: GridRect): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const stack = page && findStack(page, stackId)
  const layer = stack?.layers.find((item) => item.id === layerId)
  const widget = layer?.widgets.find((item) => item.id === widgetId)
  if (!stack || !layer || !widget) return null
  if (!isValidRect(rect, Math.max(1, stack.colSpan), Math.max(1, stack.rowSpan)) || layerOverlaps(layer, rect, widgetId)) return null
  Object.assign(widget, rect)
  return next
}

export function deleteWidgetAt(layout: DashLayout, location: WidgetLocation, widgetId: string): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, location.pageId)
  if (!page) return null

  if (location.kind === 'page') {
    if (!findWidgetInPage(page, widgetId)) return null
    page.widgets = page.widgets.filter((widget) => widget.id !== widgetId)
    return next
  }

  const stack = findStack(page, location.stackId)
  const layer = stack?.layers.find((item) => item.id === location.layerId)
  if (!layer || !layer.widgets.some((widget) => widget.id === widgetId)) return null
  layer.widgets = layer.widgets.filter((widget) => widget.id !== widgetId)
  return next
}

// ── Widget stacks ────────────────────────────────────────────────────────

/** Adds a stack with one empty layer at the first free page region — mirrors `DashLayoutEditor.TryAddWidgetStack`. */
export function addWidgetStack(layout: DashLayout, pageId: string): { layout: DashLayout; stack: DashWidgetStack } | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  if (!page) return null

  const rect = firstFit(next.gridCols, next.gridRows, DEFAULT_STACK_COL_SPAN, DEFAULT_STACK_ROW_SPAN, (candidate) => pageOverlaps(page, candidate, null))
  if (!rect) return null

  const stackIdExists = (id: string) => (page.widgetStacks ?? []).some((stack) => stack.id === id)
  const stack: DashWidgetStack = {
    id: nextId('stack', stackIdExists),
    name: `Widget Stack ${(page.widgetStacks?.length ?? 0) + 1}`,
    ...rect,
    defaultLayerId: 'layer-1',
    layers: [{ id: 'layer-1', name: 'Layer 1', widgets: [] }],
  }
  page.widgetStacks = [...(page.widgetStacks ?? []), stack]
  return { layout: next, stack }
}

export function deleteWidgetStack(layout: DashLayout, pageId: string, stackId: string): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  if (!page || !findStack(page, stackId)) return null
  page.widgetStacks = (page.widgetStacks ?? []).filter((stack) => stack.id !== stackId)
  return next
}

export function renameWidgetStack(layout: DashLayout, pageId: string, stackId: string, name: string): DashLayout | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const stack = page && findStack(page, stackId)
  if (!stack) return null
  stack.name = trimmed
  return next
}

export function setWidgetStackGeometry(layout: DashLayout, pageId: string, stackId: string, rect: GridRect): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const stack = page && findStack(page, stackId)
  if (!page || !stack) return null
  if (!isValidRect(rect, next.gridCols, next.gridRows)) return null
  const others: DashPage = { ...page, widgetStacks: (page.widgetStacks ?? []).filter((item) => item.id !== stackId) }
  if (pageOverlaps(others, rect, null)) return null
  Object.assign(stack, rect)
  return next
}

export function addStackLayer(layout: DashLayout, pageId: string, stackId: string): { layout: DashLayout; layer: DashWidgetStackLayer } | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const stack = page && findStack(page, stackId)
  if (!stack) return null
  const id = nextSequentialId('layer', (candidate) => stack.layers.some((layer) => layer.id === candidate))
  const layer: DashWidgetStackLayer = { id, name: `Layer ${stack.layers.length + 1}`, widgets: [] }
  stack.layers.push(layer)
  stack.defaultLayerId ??= id
  return { layout: next, layer }
}

export function setDefaultStackLayer(layout: DashLayout, pageId: string, stackId: string, layerId: string): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const stack = page && findStack(page, stackId)
  if (!stack || !stack.layers.some((layer) => layer.id === layerId)) return null
  stack.defaultLayerId = layerId
  return next
}

/** Never removes the last layer — mirrors `DashLayoutEditor.TryDeleteStackLayer`. */
export function deleteStackLayer(layout: DashLayout, pageId: string, stackId: string, layerId: string): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const stack = page && findStack(page, stackId)
  if (!stack || stack.layers.length <= 1 || !stack.layers.some((layer) => layer.id === layerId)) return null
  stack.layers = stack.layers.filter((layer) => layer.id !== layerId)
  if (stack.defaultLayerId === layerId) stack.defaultLayerId = stack.layers[0]?.id
  return next
}

/** Adds a widget to a layer's own local sub-grid — mirrors `DashLayoutEditor.TryAddWidgetToStackLayer`. */
export function addWidgetToStackLayer(layout: DashLayout, pageId: string, stackId: string, layerId: string, type: DashWidgetType): { layout: DashLayout; widget: DashWidget } | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const stack = page && findStack(page, stackId)
  const layer = stack?.layers.find((item) => item.id === layerId)
  if (!stack || !layer) return null

  const rect = firstFit(Math.max(1, stack.colSpan), Math.max(1, stack.rowSpan), DEFAULT_WIDGET_COL_SPAN, DEFAULT_WIDGET_ROW_SPAN, (candidate) => layerOverlaps(layer, candidate, null))
  if (!rect) return null

  const idExists = (id: string) => layer.widgets.some((widget) => widget.id === id)
  const widget: DashWidget = { id: nextId(slugify(type.replace(/_/g, '-')), idExists), type, ...rect }
  layer.widgets.push(widget)
  return { layout: next, widget }
}

// ── Alerts (DashEditorController alert methods) ─────────────────────────────

export function findAlert(layout: DashLayout, type: AlertTypeId): DashAlert | null {
  return layout.alerts.find((alert) => alert.type === type) ?? null
}

/** Enables/disables a change-alert, creating it with default geometry the first time — mirrors `DashEditorController.SetAlert`. */
export function setAlertEnabled(layout: DashLayout, type: AlertTypeId, enabled: boolean): DashLayout {
  const next = cloneLayout(layout)
  const alert = findAlert(next, type)
  if (!alert) {
    if (enabled) next.alerts.push({ id: type, type, enabled: true, col: 6, row: 3, colSpan: 8, rowSpan: 6 })
  } else {
    alert.enabled = enabled
  }

  return next
}

export function setAlertGeometry(layout: DashLayout, type: AlertTypeId, rect: GridRect): DashLayout | null {
  const next = cloneLayout(layout)
  const alert = findAlert(next, type)
  if (!alert) return null
  const colSpan = Math.min(Math.max(2, rect.colSpan), next.gridCols)
  const rowSpan = Math.min(Math.max(2, rect.rowSpan), next.gridRows)
  alert.col = Math.min(Math.max(0, rect.col), next.gridCols - colSpan)
  alert.row = Math.min(Math.max(0, rect.row), next.gridRows - rowSpan)
  alert.colSpan = colSpan
  alert.rowSpan = rowSpan
  return next
}

export type AlertOverride = { colorToken?: string; durationSeconds?: number; invertColors?: boolean }

export function setAlertOverride(layout: DashLayout, type: AlertTypeId, patch: AlertOverride): DashLayout | null {
  const next = cloneLayout(layout)
  const alert = findAlert(next, type)
  if (!alert) return null
  if (patch.colorToken !== undefined) alert.colorToken = patch.colorToken
  if (patch.durationSeconds !== undefined) alert.durationSeconds = Math.min(5, Math.max(0.5, Math.round(patch.durationSeconds * 10) / 10))
  if (patch.invertColors !== undefined) alert.invertColors = patch.invertColors
  return next
}

/** Switches an alert between its own overrides and the layout's global alert defaults — mirrors `DashEditorController.SetAlertUseGlobal`. */
export function setAlertUseGlobal(layout: DashLayout, type: AlertTypeId, useGlobal: boolean): DashLayout | null {
  const next = cloneLayout(layout)
  const alert = findAlert(next, type)
  if (!alert) return null

  if (useGlobal) {
    alert.colorToken = undefined
    alert.durationSeconds = undefined
    alert.invertColors = undefined
    return next
  }

  const global = globalAlertConfig(next)
  alert.colorToken = global.colorToken
  alert.durationSeconds = global.durationSeconds
  alert.invertColors = global.invertColors
  return next
}

export type GlobalAlertConfig = { displayMode: 'full' | 'center'; durationSeconds: number; invertColors: boolean; colorToken: string }

const DEFAULT_GLOBAL_ALERT_CONFIG: GlobalAlertConfig = { displayMode: 'full', durationSeconds: 1.5, invertColors: false, colorToken: 'auto' }

export function globalAlertConfig(layout: DashLayout): GlobalAlertConfig {
  const raw = layout.alertConfig
  if (!isRecord(raw)) return DEFAULT_GLOBAL_ALERT_CONFIG
  return {
    displayMode: raw.displayMode === 'center' ? 'center' : 'full',
    durationSeconds: typeof raw.durationSeconds === 'number' ? raw.durationSeconds : DEFAULT_GLOBAL_ALERT_CONFIG.durationSeconds,
    invertColors: raw.invertColors === true,
    colorToken: typeof raw.colorToken === 'string' ? raw.colorToken : DEFAULT_GLOBAL_ALERT_CONFIG.colorToken,
  }
}

export function setGlobalAlertConfig(layout: DashLayout, patch: Partial<GlobalAlertConfig>): DashLayout {
  const next = cloneLayout(layout)
  const merged = { ...globalAlertConfig(next), ...patch }
  if (patch.durationSeconds !== undefined) merged.durationSeconds = Math.min(5, Math.max(0.5, Math.round(patch.durationSeconds * 10) / 10))
  next.alertConfig = { ...merged, enabledTypes: next.alerts.filter((alert) => alert.enabled).map((alert) => alert.type) }
  return next
}

// ── Command builders (RuntimeCoordinator: dash.*) ───────────────────────────

export const buildDashCreate = (profileId?: string): SprintCommand => (profileId ? { type: 'dash.create', profileId } : { type: 'dash.create' })

export const buildDashDuplicate = (dashId: string, profileId: string): SprintCommand => ({ type: 'dash.duplicate', dashId, profileId })

export const buildDashSave = (dashId: string, layout: DashLayout): SprintCommand => ({ type: 'dash.save', dashId, layout })

export const buildDashReset = (dashId: string): SprintCommand => ({ type: 'dash.reset', dashId })

export const buildDashSetDefault = (dashId: string): SprintCommand => ({ type: 'dash.setDefault', dashId })

export const buildDashDelete = (dashId: string): SprintCommand => ({ type: 'dash.delete', dashId })

export const buildDashSetScreenProfile = (dashId: string, profileId: string): SprintCommand => ({ type: 'dash.setScreenProfile', dashId, profileId })
