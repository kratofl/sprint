import type { DashCategoryLists, DashRefitLosses, SprintCommand } from '../bridge'
import { LAP_SUMMARY_SECONDS, dashboardWidgetTypes, groupParents, isDashStyle, isDashWidgetGroup, isDashWidgetType, mayOverlap, stackLayers, styleColorTokens, dashAlertTypes, type DashAlertType } from '@sprint/dashboard'
import type { DashAlert, DashColorSystem, DashLayout, DashStyle, DashPage, DashTheme, DashWidget, DashWidgetStyle, DashWidgetType } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'

/**
 * Dashes domain model, parsing, and layout mutators.
 *
 * The page/widget mutators below are a hand-mirrored copy of
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

/** A widget row as the host writes it: `group` and `hidden` are omitted when unset, never null. */
function isDashWidgetRow(value: unknown): value is DashWidget {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.col === 'number' &&
    typeof value.row === 'number' &&
    typeof value.colSpan === 'number' &&
    typeof value.rowSpan === 'number' &&
    (value.group === undefined || typeof value.group === 'string') &&
    (value.hidden === undefined || typeof value.hidden === 'boolean')
  )
}

function isDashPageRow(value: unknown): value is DashPage {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !Array.isArray(value.widgets) || !value.widgets.every(isDashWidgetRow)) {
    return false
  }

  return value.groups === undefined || (Array.isArray(value.groups) && value.groups.every(isDashWidgetGroup))
}

/**
 * One raw alert row, or null when it lacks its identity or rectangle. The host writes an absent
 * look field as null; it is dropped here, so inward code sees "absent" one way only.
 */
function parseDashAlert(value: unknown): DashAlert | null {
  if (!isRecord(value)) return null
  const { id, type, enabled, col, row, colSpan, rowSpan } = value
  if (typeof id !== 'string' || typeof type !== 'string' || typeof enabled !== 'boolean') return null
  if (typeof col !== 'number' || typeof row !== 'number' || typeof colSpan !== 'number' || typeof rowSpan !== 'number') return null
  const alert: DashAlert = { id, type, enabled, col, row, colSpan, rowSpan }
  if (value.displayMode === 'full' || value.displayMode === 'center') alert.displayMode = value.displayMode
  if (typeof value.colorToken === 'string') alert.colorToken = value.colorToken
  if (typeof value.durationSeconds === 'number') alert.durationSeconds = value.durationSeconds
  if (typeof value.invertColors === 'boolean') alert.invertColors = value.invertColors
  return alert
}

/** Parses one raw `dashLayouts[]` row. Returns `null` for a row with no id — never a fabricated dash. */
export function parseDashLayout(row: Record<string, unknown>): DashLayout | null {
  if (typeof row.id !== 'string' || row.id.length === 0) {
    return null
  }

  const layout: DashLayout = {
    id: row.id,
    name: typeof row.name === 'string' ? row.name : row.id,
    mode: typeof row.mode === 'string' ? row.mode : 'basic',
    gridCols: typeof row.gridCols === 'number' && row.gridCols > 0 ? row.gridCols : 20,
    gridRows: typeof row.gridRows === 'number' && row.gridRows > 0 ? row.gridRows : 12,
    pages: Array.isArray(row.pages) ? row.pages.filter(isDashPageRow) : [],
    alerts: Array.isArray(row.alerts) ? row.alerts.map(parseDashAlert).filter((alert): alert is DashAlert => alert !== null) : [],
  }

  if (isDashPageRow(row.idlePage)) layout.idlePage = row.idlePage
  if (typeof row.screenProfile === 'string') layout.screenProfile = row.screenProfile
  if (typeof row.category === 'string' && row.category.length > 0) layout.category = row.category
  if (row.colorSystem === 'functional' || row.colorSystem === 'styled') layout.colorSystem = row.colorSystem
  if (isDashStyle(row.dashStyle)) layout.dashStyle = row.dashStyle
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

const LAP_TIME_CONFIG: readonly DashConfigField[] = [
  {
    key: 'show',
    label: 'Show',
    kind: 'select',
    default: 'all',
    options: [
      { value: 'all', label: 'Current, last and best' },
      { value: 'current', label: 'Current lap' },
      { value: 'last', label: 'Last lap' },
      { value: 'best', label: 'Best lap' },
    ],
  },
]

const GAPS_CONFIG: readonly DashConfigField[] = [
  {
    key: 'side',
    label: 'Show',
    kind: 'select',
    default: 'both',
    options: [
      { value: 'both', label: 'Ahead and behind' },
      { value: 'ahead', label: 'Car ahead' },
      { value: 'behind', label: 'Car behind' },
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
  lap_time: { type: 'lap_time', name: 'Lap Time', idleCapable: false, config: LAP_TIME_CONFIG },
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
  gaps: { type: 'gaps', name: 'Gaps', idleCapable: false, config: GAPS_CONFIG },
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
  bias_change: 'Brake bias change',
  enginemap_change: 'Engine map change',
  lap_summary: 'Lap summary',
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

export const rectsIntersect = (a: GridRect, b: GridRect): boolean => a.col < b.col + b.colSpan && a.col + a.colSpan > b.col && a.row < b.row + b.rowSpan && a.row + a.rowSpan > b.row

export const isValidRect = (rect: GridRect, cols: number, rows: number): boolean =>
  rect.col >= 0 && rect.row >= 0 && rect.colSpan > 0 && rect.rowSpan > 0 && rect.col + rect.colSpan <= cols && rect.row + rect.rowSpan <= rows

/**
 * Whether a widget `id` in `group` (null: on the page) at `candidate` would share a cell with a
 * widget it may not overlap. Only layers of one stack may overlap (`mayOverlap` in
 * `@sprint/dashboard`, mirrored by `DashLayoutValidator`). Widgets in `ignore` are left out.
 */
export function pageOverlaps(page: DashPage, candidate: GridRect, id: string, group: string | null, ignore: ReadonlySet<string> = new Set()): boolean {
  const parents = groupParents(page)
  const layers = stackLayers(page, group, id, parents)
  return page.widgets.some(
    (widget) => widget.id !== id && !ignore.has(widget.id) && rectsIntersect(widget, candidate) && !mayOverlap(layers, stackLayers(page, widget.group ?? null, widget.id, parents)),
  )
}

/** Whether every widget on the page is inside the grid and shares cells only as `pageOverlaps` allows. */
export function pageFits(page: DashPage, cols: number, rows: number): boolean {
  return page.widgets.every((widget) => isValidRect(widget, cols, rows) && !pageOverlaps(page, widget, widget.id, widget.group ?? null))
}

function firstFit(cols: number, rows: number, colSpan: number, rowSpan: number, occupied: (rect: GridRect) => boolean, within?: GridRect): GridRect | null {
  const cs = Math.max(1, Math.min(colSpan, within?.colSpan ?? cols, cols))
  const rs = Math.max(1, Math.min(rowSpan, within?.rowSpan ?? rows, rows))
  const left = within?.col ?? 0
  const top = within?.row ?? 0
  const right = within ? within.col + within.colSpan : cols
  const bottom = within ? within.row + within.rowSpan : rows
  for (let row = top; row <= bottom - rs; row++) {
    for (let col = left; col <= right - cs; col++) {
      const rect: GridRect = { col, row, colSpan: cs, rowSpan: rs }
      if (!occupied(rect)) return rect
    }
  }

  return null
}

export const DEFAULT_WIDGET_COL_SPAN = 4
export const DEFAULT_WIDGET_ROW_SPAN = 2

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'page'
}

export function nextId(base: string, exists: (id: string) => boolean): string {
  if (!exists(base)) return base
  for (let index = 2; ; index++) {
    const candidate = `${base}-${index}`
    if (!exists(candidate)) return candidate
  }
}

export function nextName(base: string, exists: (name: string) => boolean): string {
  if (!exists(base)) return base
  for (let index = 2; ; index++) {
    const candidate = `${base} ${index}`
    if (!exists(candidate)) return candidate
  }
}

/** Whether `id` is taken on the page: widgets and groups share one id space, since a stack's `shownFirst` names either. */
export const pageIdTaken = (page: DashPage, id: string): boolean => page.widgets.some((widget) => widget.id === id) || (page.groups ?? []).some((group) => group.id === id)

function cloneLayout(layout: DashLayout): DashLayout {
  return structuredClone(layout)
}

/** Finds a page by id, checking the idle page first — mirrors `DashLayoutEditor.FindPage`. */
export function findPage(layout: DashLayout, pageId: string): DashPage | null {
  if (layout.idlePage?.id === pageId) return layout.idlePage
  return layout.pages.find((page) => page.id === pageId) ?? null
}

export function findWidget(layout: DashLayout, pageId: string, widgetId: string): DashWidget | null {
  return findPage(layout, pageId)?.widgets.find((widget) => widget.id === widgetId) ?? null
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

/** Sets how every widget is framed — mirrors `DashEditorController.SetDashStyle`. The layout itself does not change. */
export function setDashStyle(layout: DashLayout, dashStyle: DashStyle): DashLayout | null {
  if ((layout.dashStyle ?? 'panels') === dashStyle) return null
  const next = cloneLayout(layout)
  next.dashStyle = dashStyle
  return next
}

// ── Page widgets ─────────────────────────────────────────────────────────

/**
 * Where a new widget goes: into `group` (null: on the page), placed inside `within` when it fits
 * there (a stack's region, so a new layer widget lands where the layer is) and anywhere free on the
 * page otherwise.
 */
export type WidgetTarget = { group: string | null; within?: GridRect }

const ON_PAGE: WidgetTarget = { group: null }

function newWidget(page: DashPage, type: DashWidgetType, rect: GridRect, group: string | null): DashWidget {
  const widget: DashWidget = { id: nextId(slugify(type.replace(/_/g, '-')), (id) => pageIdTaken(page, id)), type, ...rect }
  if (group !== null) widget.group = group
  return widget
}

/** Adds a widget at the first free grid cell — mirrors `DashLayoutEditor.TryAddWidget`. */
export function addWidget(layout: DashLayout, pageId: string, type: DashWidgetType, target: WidgetTarget = ON_PAGE): { layout: DashLayout; widget: DashWidget } | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  if (!page) return null

  const occupied = (candidate: GridRect): boolean => pageOverlaps(page, candidate, '', target.group)
  const rect =
    (target.within && firstFit(next.gridCols, next.gridRows, DEFAULT_WIDGET_COL_SPAN, DEFAULT_WIDGET_ROW_SPAN, occupied, target.within)) ||
    firstFit(next.gridCols, next.gridRows, DEFAULT_WIDGET_COL_SPAN, DEFAULT_WIDGET_ROW_SPAN, occupied)
  if (!rect) return null

  const widget = newWidget(page, type, rect, target.group)
  page.widgets.push(widget)
  return { layout: next, widget }
}

/** Non-mutating placement check for a not-yet-created widget (palette drag ghost) — mirrors `DashLayoutEditor.CanPlaceNewWidget`. */
export function canPlaceNewWidget(layout: DashLayout, pageId: string, rect: GridRect, group: string | null = null): boolean {
  const page = findPage(layout, pageId)
  if (!page || !isValidRect(rect, layout.gridCols, layout.gridRows)) return false
  return !pageOverlaps(page, rect, '', group)
}

/** Adds a widget at an explicit grid cell (drag-drop placement) — mirrors `DashLayoutEditor.TryAddWidgetAt`. The requested cell is clamped in-bounds; placement is rejected (no fallback) if it would overlap, so a drop onto an occupied cell fails rather than silently jumping. */
export function addWidgetAt(layout: DashLayout, pageId: string, type: DashWidgetType, col: number, row: number, group: string | null = null): { layout: DashLayout; widget: DashWidget } | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  if (!page) return null

  const colSpan = Math.min(DEFAULT_WIDGET_COL_SPAN, next.gridCols)
  const rowSpan = Math.min(DEFAULT_WIDGET_ROW_SPAN, next.gridRows)
  const rect: GridRect = { col: Math.max(0, Math.min(col, next.gridCols - colSpan)), row: Math.max(0, Math.min(row, next.gridRows - rowSpan)), colSpan, rowSpan }
  if (pageOverlaps(page, rect, '', group)) return null

  const widget = newWidget(page, type, rect, group)
  page.widgets.push(widget)
  return { layout: next, widget }
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

/** Sets a widget's full geometry in one step (numeric grid inspector) — mirrors `DashLayoutEditor.TrySetWidgetGeometry`. */
export function setWidgetGeometry(layout: DashLayout, pageId: string, widgetId: string, rect: GridRect): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const widget = page?.widgets.find((item) => item.id === widgetId)
  if (!page || !widget || !isValidRect(rect, next.gridCols, next.gridRows) || pageOverlaps(page, rect, widget.id, widget.group ?? null)) return null
  Object.assign(widget, rect)
  return next
}

export function clearPage(layout: DashLayout, pageId: string): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  if (!page) return null
  page.widgets = []
  page.groups = []
  return next
}

// ── Widget config / style ────────────────────────────────────────────────

function withWidget(layout: DashLayout, pageId: string, widgetId: string, mutate: (widget: DashWidget) => void): DashLayout | null {
  const next = cloneLayout(layout)
  const widget = findWidget(next, pageId, widgetId)
  if (!widget) return null
  mutate(widget)
  return next
}

/** Sets (or clears, when blank) a string config value — mirrors `DashEditorController.SetSelectedConfig`. */
export function setWidgetConfig(layout: DashLayout, pageId: string, widgetId: string, key: string, value: string): DashLayout | null {
  return withWidget(layout, pageId, widgetId, (widget) => {
    const config = { ...(widget.config ?? {}) }
    if (value.length === 0) delete config[key]
    else config[key] = value
    widget.config = Object.keys(config).length > 0 ? config : undefined
  })
}

export function setWidgetStyle(layout: DashLayout, pageId: string, widgetId: string, patch: Partial<DashWidgetStyle>): DashLayout | null {
  return withWidget(layout, pageId, widgetId, (widget) => {
    const style: DashWidgetStyle = { ...(widget.style ?? {}), ...patch }
    widget.style = style.textColor || style.labelColor ? style : undefined
  })
}

// ── Alerts (DashEditorController alert methods) ─────────────────────────────

export function findAlert(layout: DashLayout, type: AlertTypeId): DashAlert | null {
  return layout.alerts.find((alert) => alert.type === type) ?? null
}

/** A change-alert as it is first turned on: in the default box, wearing the defaults. */
const newAlert = (type: AlertTypeId): DashAlert => ({ id: type, type, enabled: true, col: 6, row: 3, colSpan: 8, rowSpan: 6 })

/** Enables/disables a change-alert, creating it with default geometry the first time — mirrors `DashEditorController.SetAlert`. */
export function setAlertEnabled(layout: DashLayout, type: AlertTypeId, enabled: boolean): DashLayout {
  const next = cloneLayout(layout)
  const alert = findAlert(next, type)
  if (!alert) {
    if (enabled) next.alerts.push(newAlert(type))
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

/** Where an alert shows: over the whole dash, or in its own box on it. */
export type AlertDisplayMode = 'full' | 'center'

export type AlertOverride = { displayMode?: AlertDisplayMode; colorToken?: string; durationSeconds?: number; invertColors?: boolean }

export function setAlertOverride(layout: DashLayout, type: AlertTypeId, patch: AlertOverride): DashLayout | null {
  const next = cloneLayout(layout)
  const alert = findAlert(next, type)
  if (!alert) return null
  if (patch.displayMode !== undefined) alert.displayMode = patch.displayMode
  if (patch.colorToken !== undefined) alert.colorToken = patch.colorToken
  if (patch.durationSeconds !== undefined) alert.durationSeconds = Math.min(5, Math.max(0.5, Math.round(patch.durationSeconds * 10) / 10))
  if (patch.invertColors !== undefined) alert.invertColors = patch.invertColors
  return next
}

/** Switches an alert between its own look (starting from the defaults) and the layout's global alert defaults — mirrors `DashEditorController.SetAlertUseGlobal`. */
export function setAlertUseGlobal(layout: DashLayout, type: AlertTypeId, useGlobal: boolean): DashLayout | null {
  const next = cloneLayout(layout)
  const alert = findAlert(next, type)
  if (!alert) return null

  if (useGlobal) {
    alert.displayMode = undefined
    alert.colorToken = undefined
    alert.durationSeconds = undefined
    alert.invertColors = undefined
    return next
  }

  const global = globalAlertConfig(next)
  alert.displayMode = global.displayMode
  alert.colorToken = global.colorToken
  alert.durationSeconds = global.durationSeconds
  alert.invertColors = global.invertColors
  return next
}

export type GlobalAlertConfig = { displayMode: AlertDisplayMode; durationSeconds: number; invertColors: boolean; colorToken: string }

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

/** An alert's look as it fires: `own` when it has its own, otherwise the defaults every alert shares. */
export type AlertLook = GlobalAlertConfig & { own: boolean }

/**
 * The look `type` fires with. The lap summary has only a duration of its own: it always fills
 * the screen in its own colours, and stays up `LAP_SUMMARY_SECONDS` unless it says otherwise.
 */
export function alertLook(layout: DashLayout, type: AlertTypeId): AlertLook {
  const global = globalAlertConfig(layout)
  const alert = findAlert(layout, type)
  if (type === 'lap_summary') return { ...global, displayMode: 'full', durationSeconds: alert?.durationSeconds ?? LAP_SUMMARY_SECONDS, own: false }
  if (!alert) return { ...global, own: false }
  return {
    displayMode: alert.displayMode ?? global.displayMode,
    colorToken: alert.colorToken ?? global.colorToken,
    durationSeconds: alert.durationSeconds ?? global.durationSeconds,
    invertColors: alert.invertColors ?? global.invertColors,
    own: alert.displayMode !== undefined || alert.colorToken !== undefined || alert.durationSeconds !== undefined || alert.invertColors !== undefined,
  }
}

/**
 * The alert the designer plays for a selection: that alert (or a new one in the default box
 * while it has never been on), or for "All alerts" (null) the first setting alert that is on,
 * stripped of any look of its own so it shows the defaults.
 */
export function alertToPlay(layout: DashLayout, type: AlertTypeId | null): DashAlert {
  if (type !== null) return findAlert(layout, type) ?? newAlert(type)
  const { id, type: firstType, enabled, col, row, colSpan, rowSpan } = layout.alerts.find((alert) => alert.enabled && alert.type !== 'lap_summary') ?? newAlert('tc_change')
  return { id, type: firstType, enabled, col, row, colSpan, rowSpan }
}

// ── Command builders (RuntimeCoordinator: dash.*) ───────────────────────────

/** Where a new dash starts: empty, or a copy of an existing dash refitted to the chosen screen. */
export type DashStart = { kind: 'blank' } | { kind: 'copy'; dashId: string }

/** A dash's category on the wire: a known category name, or null for "Other". */
export type DashCategoryChoice = string | null

/**
 * The New dash dialog (blank) and the Duplicate dialog (a copy). Leaving `name` out lets the
 * host pick one; leaving `category` out keeps a copy's category, none for blank.
 */
export function buildDashCreate(options: { start: DashStart; profileId?: string; name?: string; category?: DashCategoryChoice } = { start: { kind: 'blank' } }): SprintCommand {
  const command: SprintCommand = { type: 'dash.create' }
  if (options.start.kind === 'copy') command.sourceDashId = options.start.dashId
  if (options.profileId !== undefined) command.profileId = options.profileId
  if (options.name !== undefined) command.name = options.name
  if (options.category !== undefined) command.category = options.category
  return command
}

export const buildDashSave = (dashId: string, layout: DashLayout): SprintCommand => ({ type: 'dash.save', dashId, layout })

export const buildDashReset = (dashId: string): SprintCommand => ({ type: 'dash.reset', dashId })

export const buildDashDelete = (dashId: string): SprintCommand => ({ type: 'dash.delete', dashId })

export const buildDashSetScreenProfile = (dashId: string, profileId: string): SprintCommand => ({ type: 'dash.setScreenProfile', dashId, profileId })

export const buildDashSetCategory = (dashId: string, category: DashCategoryChoice): SprintCommand => ({ type: 'dash.setCategory', dashId, category })

/** Creates a custom category; with `dashId` the dash moves into it in the same command ("New category…" in a dash's menu). */
export const buildDashCategoryCreate = (name: string, dashId?: string): SprintCommand =>
  dashId === undefined ? { type: 'dash.category.create', name } : { type: 'dash.category.create', name, dashId }

export const buildDashCategoryRename = (name: string, newName: string): SprintCommand => ({ type: 'dash.category.rename', name, newName })

/** Deletes a custom category; its dashes move to "Other". */
export const buildDashCategoryDelete = (name: string): SprintCommand => ({ type: 'dash.category.delete', name })

// ── Dashes overview (DashesView.tsx) ────────────────────────────────────────
//
// A dash sits in at most one category (`DashLayout.category`); none groups last as "Other".
// The host owns the category lists (`SprintState.dashCategories`) and stores a dash's
// category in its known spelling, so names compare exactly here.

/** What the overview shows: every dash, one category's, or the uncategorised ones. */
export type DashesFilter = { kind: 'all' } | { kind: 'category'; name: string } | { kind: 'other' }

export const ALL_DASHES: DashesFilter = { kind: 'all' }

/** One section of the overview; `custom` marks the user's own category (it can be renamed or deleted). */
export type DashGroup = { filter: DashesFilter; title: string; custom: boolean; dashes: DashLayout[] }

/** A dash's category if the host still knows it, otherwise null ("Other"). */
export const knownDashCategory = (layout: DashLayout, categories: DashCategoryLists): string | null => {
  const category = layout.category ?? null
  return category !== null && (categories.builtIn.includes(category) || categories.custom.includes(category)) ? category : null
}

/**
 * Every category with dashes in page order — the built-ins, then the user's own, then "Other" —
 * each with its dashes in library order. Empty categories are left out.
 */
export function groupDashes(layouts: readonly DashLayout[], categories: DashCategoryLists): DashGroup[] {
  const named = [...categories.builtIn.map((name) => ({ name, custom: false })), ...categories.custom.map((name) => ({ name, custom: true }))]
  const groups: DashGroup[] = named.map(({ name, custom }) => ({
    filter: { kind: 'category', name },
    title: name,
    custom,
    dashes: layouts.filter((layout) => knownDashCategory(layout, categories) === name),
  }))
  groups.push({ filter: { kind: 'other' }, title: 'Other', custom: false, dashes: layouts.filter((layout) => knownDashCategory(layout, categories) === null) })
  return groups.filter((group) => group.dashes.length > 0)
}

export const sameDashesFilter = (a: DashesFilter, b: DashesFilter): boolean =>
  a.kind === b.kind && (a.kind !== 'category' || (b.kind === 'category' && a.name === b.name))

/**
 * The filter in effect: the chosen one while its category still exists, otherwise All (the
 * category was deleted or renamed underneath it). A category left empty stays chosen, so moving
 * its last dash out does not make the page jump.
 */
export function resolveDashesFilter(filter: DashesFilter, categories: DashCategoryLists): DashesFilter {
  if (filter.kind !== 'category') return filter
  return categories.builtIn.includes(filter.name) || categories.custom.includes(filter.name) ? filter : ALL_DASHES
}

/** The groups a filter shows: all of them under All, otherwise the one it names (none once it has emptied). */
export const visibleDashGroups = (groups: readonly DashGroup[], filter: DashesFilter): DashGroup[] =>
  filter.kind === 'all' ? [...groups] : groups.filter((group) => sameDashesFilter(group.filter, filter))

export type DashesFilterOption = { filter: DashesFilter; label: string; count: number }

/**
 * The filter bar: "All" plus each non-empty group with its count, and the current filter even
 * after it has emptied. Null when it would offer nothing more than All: every dash in one group.
 */
export function dashesFilterOptions(groups: readonly DashGroup[], filter: DashesFilter): DashesFilterOption[] | null {
  const total = groups.reduce((sum, group) => sum + group.dashes.length, 0)
  const options: DashesFilterOption[] = groups.map((group) => ({ filter: group.filter, label: group.title, count: group.dashes.length }))
  if (filter.kind !== 'all' && !groups.some((group) => sameDashesFilter(group.filter, filter))) {
    options.push({ filter, label: filter.kind === 'category' ? filter.name : 'Other', count: 0 })
  }
  if (options.length < 2 && filter.kind === 'all') return null
  return [{ filter: ALL_DASHES, label: 'All', count: total }, ...options]
}

/** The category a new dash starts in: the one being looked at, otherwise none ("Other"). */
export const newDashCategory = (filter: DashesFilter): DashCategoryChoice => (filter.kind === 'category' ? filter.name : null)

export const dashPageCount = (layout: DashLayout): number => layout.pages.length + (layout.idlePage ? 1 : 0)

export const formatPageCount = (count: number): string => `${count} ${count === 1 ? 'page' : 'pages'}`

/** The quiet line under a dash's name: "Landscape 800 × 480 · 5 pages". */
export const dashSummary = (layout: DashLayout): string => `${layoutScreenProfile(layout).name} · ${formatPageCount(dashPageCount(layout))}`

/**
 * Whether two parsed dashes draw the same. State arrives as fresh objects on every poll, so the
 * still pictures compare content, not identity, and redraw only when a dash really changed.
 */
export const sameDashContent = (a: DashLayout, b: DashLayout): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

/** The name the host gives a new dash left unnamed (`DesktopRuntime.CreateBlankDashLayout` / `DuplicateDashToProfile`). */
export const defaultDashName = (source: DashLayout | null): string => (source ? `${source.name} copy` : 'New dash')

/** A screen size in the New dash and Duplicate dialogs, with the names of the user's screens that have it. */
export type ScreenChoice = { profile: ScreenProfile; fits: string[] }

/**
 * The New dash and Duplicate dialogs' screen sizes: the ones the user's screens have first, then the rest,
 * each part in catalog order. `screens` are the devices' logical (rotated) sizes; a size no
 * profile matches is not offered.
 */
export function screenChoices(screens: ReadonlyArray<{ name: string; width: number; height: number }>): { fitting: ScreenChoice[]; other: ScreenChoice[] } {
  const choices = SCREEN_PROFILES.map((profile) => ({
    profile,
    fits: [...new Set(screens.filter((screen) => screen.width === profile.width && screen.height === profile.height).map((screen) => screen.name))],
  }))
  return { fitting: choices.filter((choice) => choice.fits.length > 0), other: choices.filter((choice) => choice.fits.length === 0) }
}

/** The size the dialog starts on: the copied dash's own, else the first of the user's screens, else the catalog's first. */
export const initialScreenProfile = (source: DashLayout | null, fitting: readonly ScreenChoice[]): ScreenProfile =>
  source ? layoutScreenProfile(source) : (fitting[0]?.profile ?? SCREEN_PROFILES[0])

// ── Refit losses (SprintState.dashRefitLosses) ──────────────────────────────
//
// Only the host knows which widgets a change of size leaves out (`DashLayoutEditor.RefitPage`);
// it sends the count per dash and size, and these only word it.

/** How many widgets refitting `dashId` to `profileId` would leave out; 0 when none (or unknown). */
export const refitLoss = (losses: DashRefitLosses, dashId: string, profileId: string): number => losses[dashId]?.[profileId] ?? 0

const widgetCount = (count: number): string => `${count} ${count === 1 ? 'widget' : 'widgets'}`

/** The warning before a size is picked: "4 widgets don't fit on Portrait 480 × 800 and will be left out." */
export const refitLossWarning = (count: number, profile: ScreenProfile): string =>
  `${widgetCount(count)} ${count === 1 ? "doesn't" : "don't"} fit on ${profile.name} and will be left out.`

/** The note once a size was picked that left widgets out; the change can be undone. */
export const refitLossNote = (count: number, profile: ScreenProfile): string =>
  `${widgetCount(count)} didn't fit on ${profile.name} and ${count === 1 ? 'was' : 'were'} left out. Undo brings ${count === 1 ? 'it' : 'them'} back.`

/** The short line under a size in the designer: "4 widgets don't fit". */
export const refitLossHint = (count: number): string => `${widgetCount(count)} ${count === 1 ? "doesn't" : "don't"} fit`

/**
 * What is wrong with a name for a new custom category, or for the new name of `renaming` — the
 * client-side mirror of `DashCategories.TryValidateName`, so a dialog can say so before sending.
 * Null when the name is fine.
 */
export function dashCategoryNameProblem(name: string, categories: DashCategoryLists, renaming: string | null = null): string | null {
  const trimmed = name.trim()
  const key = trimmed.toLowerCase()
  if (key.length === 0) return 'Enter a name.'
  if (key === 'all' || key === 'other') return `"${trimmed}" is already used by the page.`
  if (categories.builtIn.some((known) => known.toLowerCase() === key)) return `${trimmed} is a built-in category.`
  const taken = categories.custom.some((known) => known.toLowerCase() === key && known.toLowerCase() !== renaming?.toLowerCase())
  return taken ? `You already have a category called ${trimmed}.` : null
}

// ── Tiles / list (Settings.DashesUI.ViewMode) ───────────────────────────────
//
// Persisted through `settings.update`'s `dashesUiViewMode`, like the Devices overview's; the
// wire name of tiles is "gallery".

export type DashesViewMode = 'gallery' | 'list'

export const parseDashesViewMode = (settings: Record<string, unknown>): DashesViewMode => {
  const dashesUI = settings.dashesUI
  return isRecord(dashesUI) && dashesUI.viewMode === 'list' ? 'list' : 'gallery'
}

export const buildDashesViewMode = (mode: DashesViewMode): SprintCommand => ({ type: 'settings.update', dashesUiViewMode: mode })
