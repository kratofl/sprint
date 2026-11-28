import type { DashCategoryLists, DashRefitLosses, SprintCommand } from '../bridge'
import { dashboardWidgetTypes, groupParents, isDashPitLimiterStyle, isDashWidgetGroup, isDashWidgetType, mayOverlap, stackLayers } from '@sprint/dashboard'
import { DEFAULT_PIT_LIMITER_STYLE, formIndex, holdsSmallest, layoutRect, referenceSize, widgetForms, type WidgetForm } from '@sprint/dashboard'
import type { DashAlert, DashLayout, DashPitLimiter, DashPage, DashTheme, DashVariant, DashVariantScope, DashWidget, DashWidgetStyle, DashWidgetType, LayoutGrid } from '@sprint/dashboard'
import { variantLayoutOf } from '../designer/variants'
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
 * The widget-type catalog is hand-mirrored too — see the comment at
 * `WIDGET_CATALOG` below for what it still needs to stay in sync with, and why
 * it is not read from published host state yet.
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

/** The layout's pit limiter as the host keeps it (it does not model it): its style, and the widget and group rows that are whole. */
function parsePitLimiter(value: Record<string, unknown>): DashPitLimiter {
  const pitLimiter: DashPitLimiter = {
    style: isDashPitLimiterStyle(value.style) ? value.style : DEFAULT_PIT_LIMITER_STYLE,
    widgets: Array.isArray(value.widgets) ? value.widgets.filter(isDashWidgetRow) : [],
  }
  if (Array.isArray(value.groups)) pitLimiter.groups = value.groups.filter(isDashWidgetGroup)
  return pitLimiter
}

/**
 * One raw alert row, or null when it lacks its identity or rectangle. The host writes an absent
 * look field as null; it is dropped here, so inward code sees "absent" one way only. A dash's own
 * alerts only ride along so a save keeps them: alerts are app-wide now (Dashes > Settings), and
 * whoever draws a dash stamps those on instead (`stampDashAlerts`).
 */
function parseDashAlert(value: unknown): DashAlert | null {
  if (!isRecord(value)) return null
  const { id, type, enabled, col, row, colSpan, rowSpan } = value
  if (typeof id !== 'string' || typeof type !== 'string' || typeof enabled !== 'boolean') return null
  if (typeof col !== 'number' || typeof row !== 'number' || typeof colSpan !== 'number' || typeof rowSpan !== 'number') return null
  const alert: DashAlert = { id, type, enabled, col, row, colSpan, rowSpan }
  if (value.displayMode === 'full' || value.displayMode === 'strip' || value.displayMode === 'center') alert.displayMode = value.displayMode
  if (typeof value.colorToken === 'string') alert.colorToken = value.colorToken
  if (typeof value.durationSeconds === 'number') alert.durationSeconds = value.durationSeconds
  if (typeof value.invertColors === 'boolean') alert.invertColors = value.invertColors
  return alert
}

/** A host row's track sizes (`colSizes`/`rowSizes`): one positive number per track, else undefined. */
const trackSizes = (value: unknown, count: number): number[] | undefined =>
  Array.isArray(value) && value.length === count && value.every((size) => typeof size === 'number' && Number.isFinite(size) && size > 0) ? value : undefined

const VARIANT_LEVELS = ['device', 'game', 'carClass', 'car'] as const

/** A host row's variants that are whole: a scope naming at least one level, content that reads like a dash's. */
function parseVariants(value: unknown, id: string): DashVariant[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row): DashVariant[] => {
    if (!isRecord(row) || !isRecord(row.scope) || !isRecord(row.layout)) return []
    const scope: DashVariantScope = {}
    for (const level of VARIANT_LEVELS) {
      const named = row.scope[level]
      if (typeof named === 'string' && named.trim() !== '') scope[level] = named
    }
    const shown = parseDashLayout({ ...row.layout, id })
    return Object.keys(scope).length > 0 && shown ? [{ scope, layout: variantLayoutOf(shown) }] : []
  })
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
  const colSizes = trackSizes(row.colSizes, layout.gridCols)
  const rowSizes = trackSizes(row.rowSizes, layout.gridRows)
  if (colSizes && rowSizes) {
    layout.colSizes = colSizes
    layout.rowSizes = rowSizes
  }
  if (isRecord(row.theme)) {
    layout.theme = Object.fromEntries(Object.entries(row.theme).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  }
  // The renderer reads each cell defensively (lapReviewCells); only the shape is checked here.
  if (isRecord(row.lapReview) && Array.isArray(row.lapReview.cells)) layout.lapReview = { cells: row.lapReview.cells.filter((cell): cell is string => typeof cell === 'string') }
  if (isRecord(row.pitLimiter)) layout.pitLimiter = parsePitLimiter(row.pitLimiter)
  const variants = parseVariants(row.variants, row.id)
  if (variants.length > 0) layout.variants = variants

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

/** Narrows `SprintState.telemetry.frame` (an untyped record) for the live preview. The dash renderer treats a missing frame as "no data" on its own. */
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

// A dash with its own track sizes says nothing about its screen: without a profile it is the default one.
export const layoutScreenProfile = (layout: DashLayout): ScreenProfile =>
  layout.screenProfile ? resolveScreenProfile(layout.screenProfile) : layout.colSizes ? SCREEN_PROFILES[0] : matchScreenProfileToGrid(layout.gridCols, layout.gridRows)

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
// `dashboardWidgetTypes` come from `@sprint/dashboard` (packages/dashboard/src/widgetTypes.ts),
// which is itself the one hand-mirrored copy of `DashWidgetCatalog.cs`'s type
// list shared by every desktop-app consumer (a Rust test pins it to what the
// renderer draws). `WIDGET_CATALOG` below is typed
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
/**
 * A widget setting the inspector edits: free text, a pick from `options`, or a switch (`on` / `off`);
 * `needs` names a switch that must be on for this one to change anything.
 */
export type DashConfigField = { key: string; label: string; kind: 'text' | 'select' | 'switch'; default: string; options: readonly DashConfigOption[]; needs?: string }
export type DashWidgetDefinition = { type: DashWidgetType; name: string; idleCapable: boolean; config: readonly DashConfigField[] }

const NO_CONFIG: readonly DashConfigField[] = []

/** Static text, or who drives and where (`TEXT_BINDINGS` in the renderer); live values have widgets of their own. */
const TEXT_CONFIG: readonly DashConfigField[] = [
  { key: 'content', label: 'Text', kind: 'text', default: '', options: [] },
  {
    key: 'binding',
    label: 'Shows instead',
    kind: 'select',
    default: '',
    options: [
      { value: '', label: 'Nothing (the text)' },
      { value: 'profile.driverName', label: 'Driver name' },
      { value: 'profile.driverNumber', label: 'Driver number' },
      { value: 'session.track', label: 'Track' },
      { value: 'session.car', label: 'Car' },
    ],
  },
]

/** The gear's parts round its digit (`GearParts` in the renderer): inputs and the revs and speed on, swapped off. */
const GEAR_CONFIG: readonly DashConfigField[] = [
  { key: 'inputs', label: 'Throttle, brake and clutch', kind: 'switch', default: 'on', options: [] },
  { key: 'readouts', label: 'RPM and speed', kind: 'switch', default: 'on', options: [] },
  { key: 'flip', label: 'Speed above, RPM below', kind: 'switch', default: 'off', options: [], needs: 'readouts' },
]

const TYRE_CONFIG: readonly DashConfigField[] = [
  {
    key: 'corner',
    label: 'Tyre',
    kind: 'select',
    default: 'fl',
    options: [
      { value: 'fl', label: 'Front left' },
      { value: 'fr', label: 'Front right' },
      { value: 'rl', label: 'Rear left' },
      { value: 'rr', label: 'Rear right' },
    ],
  },
]

/** UI metadata in catalog order (DashWidgetCatalog.cs — see the section comment above). `idleCapable` hides live-telemetry widgets from the idle-page palette. */
const WIDGET_CATALOG: Readonly<Record<DashWidgetType, DashWidgetDefinition>> = {
  text: { type: 'text', name: 'Text', idleCapable: true, config: TEXT_CONFIG },
  gear: { type: 'gear', name: 'Gear', idleCapable: true, config: GEAR_CONFIG },
  gear_speed: { type: 'gear_speed', name: 'Gear + Speed', idleCapable: true, config: NO_CONFIG },
  input_trace: { type: 'input_trace', name: 'Input Trace', idleCapable: false, config: NO_CONFIG },
  current_lap: { type: 'current_lap', name: 'Current Lap', idleCapable: false, config: NO_CONFIG },
  last_lap: { type: 'last_lap', name: 'Last Lap', idleCapable: false, config: NO_CONFIG },
  best_lap: { type: 'best_lap', name: 'Best Lap', idleCapable: false, config: NO_CONFIG },
  session_best: { type: 'session_best', name: 'Session Best', idleCapable: false, config: NO_CONFIG },
  class_best: { type: 'class_best', name: 'Class Best', idleCapable: false, config: NO_CONFIG },
  delta: { type: 'delta', name: 'Delta', idleCapable: false, config: NO_CONFIG },
  fuel: { type: 'fuel', name: 'Fuel', idleCapable: true, config: NO_CONFIG },
  tyre_temp: { type: 'tyre_temp', name: 'Tyre Temperature', idleCapable: true, config: NO_CONFIG },
  tc: { type: 'tc', name: 'TC', idleCapable: false, config: NO_CONFIG },
  tc2: { type: 'tc2', name: 'TC 2', idleCapable: false, config: NO_CONFIG },
  tc_slip: { type: 'tc_slip', name: 'TC Slip', idleCapable: false, config: NO_CONFIG },
  abs: { type: 'abs', name: 'ABS', idleCapable: false, config: NO_CONFIG },
  engine_map: { type: 'engine_map', name: 'Engine Map', idleCapable: false, config: NO_CONFIG },
  brake_bias: { type: 'brake_bias', name: 'Brake Bias', idleCapable: false, config: NO_CONFIG },
  migration: { type: 'migration', name: 'Brake Migration', idleCapable: false, config: NO_CONFIG },
  arb_front: { type: 'arb_front', name: 'ARB Front', idleCapable: false, config: NO_CONFIG },
  arb_rear: { type: 'arb_rear', name: 'ARB Rear', idleCapable: false, config: NO_CONFIG },
  lights: { type: 'lights', name: 'Lights', idleCapable: false, config: NO_CONFIG },
  fuel_target: { type: 'fuel_target', name: 'Fuel Target', idleCapable: false, config: NO_CONFIG },
  position: { type: 'position', name: 'Position', idleCapable: false, config: NO_CONFIG },
  class_position: { type: 'class_position', name: 'Class Position', idleCapable: false, config: NO_CONFIG },
  gap_ahead: { type: 'gap_ahead', name: 'Gap Ahead', idleCapable: false, config: NO_CONFIG },
  gap_behind: { type: 'gap_behind', name: 'Gap Behind', idleCapable: false, config: NO_CONFIG },
  class_gap_ahead: { type: 'class_gap_ahead', name: 'Class Gap Ahead', idleCapable: false, config: NO_CONFIG },
  class_gap_behind: { type: 'class_gap_behind', name: 'Class Gap Behind', idleCapable: false, config: NO_CONFIG },
  position_gap_ahead: { type: 'position_gap_ahead', name: 'Position Gap Ahead', idleCapable: false, config: NO_CONFIG },
  position_gap_behind: { type: 'position_gap_behind', name: 'Position Gap Behind', idleCapable: false, config: NO_CONFIG },
  gap_to_leader: { type: 'gap_to_leader', name: 'Gap to Leader', idleCapable: false, config: NO_CONFIG },
  gap_to_class_leader: { type: 'gap_to_class_leader', name: 'Gap to Class Leader', idleCapable: false, config: NO_CONFIG },
  track_limits: { type: 'track_limits', name: 'Track Limits', idleCapable: false, config: NO_CONFIG },
  incidents: { type: 'incidents', name: 'Incidents', idleCapable: false, config: NO_CONFIG },
  pit_stops: { type: 'pit_stops', name: 'Pit Stops', idleCapable: false, config: NO_CONFIG },
  predictive_lap: { type: 'predictive_lap', name: 'Predicted Lap', idleCapable: false, config: NO_CONFIG },
  optimal_lap: { type: 'optimal_lap', name: 'Optimal Lap', idleCapable: false, config: NO_CONFIG },
  lap_avg_5: { type: 'lap_avg_5', name: '5 Lap Average', idleCapable: false, config: NO_CONFIG },
  lap_avg_10: { type: 'lap_avg_10', name: '10 Lap Average', idleCapable: false, config: NO_CONFIG },
  all_time_best: { type: 'all_time_best', name: 'All-Time Best', idleCapable: false, config: NO_CONFIG },
  session_name: { type: 'session_name', name: 'Session', idleCapable: false, config: NO_CONFIG },
  session_time: { type: 'session_time', name: 'Session Time', idleCapable: false, config: NO_CONFIG },
  pit_loss: { type: 'pit_loss', name: 'Pit Loss', idleCapable: false, config: NO_CONFIG },
  tyre_pressure: { type: 'tyre_pressure', name: 'Tyre Pressure', idleCapable: true, config: NO_CONFIG },
  tyre_core_temp: { type: 'tyre_core_temp', name: 'Tyre Core Temperature', idleCapable: true, config: NO_CONFIG },
  tyre_avg: { type: 'tyre_avg', name: 'Tyre Average Temperature', idleCapable: false, config: NO_CONFIG },
  brake_temp: { type: 'brake_temp', name: 'Brake Temperature', idleCapable: true, config: NO_CONFIG },
  tyre_temp_numbers: { type: 'tyre_temp_numbers', name: 'Tyre Temp Numbers', idleCapable: true, config: NO_CONFIG },
  brake_temp_numbers: { type: 'brake_temp_numbers', name: 'Brake Temp Numbers', idleCapable: true, config: NO_CONFIG },
  tyre_brake_temp_numbers: { type: 'tyre_brake_temp_numbers', name: 'Tyre + Brake Numbers', idleCapable: true, config: NO_CONFIG },
  tyre_wear_lap: { type: 'tyre_wear_lap', name: 'Wear Per Lap', idleCapable: false, config: NO_CONFIG },
  tyre_laps_left: { type: 'tyre_laps_left', name: 'Tyre Laps Left', idleCapable: false, config: NO_CONFIG },
  ve_percent: { type: 've_percent', name: 'Virtual Energy', idleCapable: false, config: NO_CONFIG },
  ve_per_lap: { type: 've_per_lap', name: 'VE Per Lap', idleCapable: false, config: NO_CONFIG },
  ve_last_lap: { type: 've_last_lap', name: 'VE Last Lap', idleCapable: false, config: NO_CONFIG },
  ve_stint_avg: { type: 've_stint_avg', name: 'VE Stint Average', idleCapable: false, config: NO_CONFIG },
  ve_refuel: { type: 've_refuel', name: 'VE Refuel', idleCapable: false, config: NO_CONFIG },
  battery: { type: 'battery', name: 'Battery', idleCapable: false, config: NO_CONFIG },
  deploy: { type: 'deploy', name: 'Deploy', idleCapable: false, config: NO_CONFIG },
  regen: { type: 'regen', name: 'Regen', idleCapable: false, config: NO_CONFIG },
  motor_state: { type: 'motor_state', name: 'Motor State', idleCapable: false, config: NO_CONFIG },
  lift_coast: { type: 'lift_coast', name: 'Lift & Coast', idleCapable: false, config: NO_CONFIG },
  relative: { type: 'relative', name: 'Relative', idleCapable: false, config: NO_CONFIG },
  damage: { type: 'damage', name: 'Damage', idleCapable: false, config: NO_CONFIG },
  fuel_bar: { type: 'fuel_bar', name: 'Fuel Bar', idleCapable: false, config: NO_CONFIG },
  ve_bar: { type: 've_bar', name: 'VE Bar', idleCapable: false, config: NO_CONFIG },
  battery_bar: { type: 'battery_bar', name: 'Battery Bar', idleCapable: false, config: NO_CONFIG },
  fuel_ve_bar: { type: 'fuel_ve_bar', name: 'Fuel + VE Bar', idleCapable: false, config: NO_CONFIG },
  delta_bar: { type: 'delta_bar', name: 'Delta Bar', idleCapable: false, config: NO_CONFIG },
  gap_bar: { type: 'gap_bar', name: 'Gap Bar', idleCapable: false, config: NO_CONFIG },
  class_gap_bar: { type: 'class_gap_bar', name: 'Class Gap Bar', idleCapable: false, config: NO_CONFIG },
  sector_bar: { type: 'sector_bar', name: 'Sector Bar', idleCapable: false, config: NO_CONFIG },
  inputs_bar: { type: 'inputs_bar', name: 'Inputs Bar', idleCapable: false, config: NO_CONFIG },
  throttle_bar: { type: 'throttle_bar', name: 'Throttle Bar', idleCapable: false, config: NO_CONFIG },
  brake_bar: { type: 'brake_bar', name: 'Brake Bar', idleCapable: false, config: NO_CONFIG },
  clutch_bar: { type: 'clutch_bar', name: 'Clutch Bar', idleCapable: false, config: NO_CONFIG },
  rpm_bar: { type: 'rpm_bar', name: 'RPM Bar', idleCapable: false, config: NO_CONFIG },
  spotter_bar: { type: 'spotter_bar', name: 'Spotter', idleCapable: false, config: NO_CONFIG },
  relative_bar: { type: 'relative_bar', name: 'Relative Bar', idleCapable: false, config: NO_CONFIG },
  tyre: { type: 'tyre', name: 'Tyre', idleCapable: true, config: TYRE_CONFIG },
  sectors: { type: 'sectors', name: 'Sectors', idleCapable: false, config: NO_CONFIG },
  speed: { type: 'speed', name: 'Speed', idleCapable: true, config: NO_CONFIG },
  laps: { type: 'laps', name: 'Lap', idleCapable: false, config: NO_CONFIG },
  fuel_laps: { type: 'fuel_laps', name: 'Fuel Laps Left', idleCapable: false, config: NO_CONFIG },
  ve_laps: { type: 've_laps', name: 'Energy Laps Left', idleCapable: false, config: NO_CONFIG },
  time_left: { type: 'time_left', name: 'Time Left', idleCapable: false, config: NO_CONFIG },
  fuel_avg: { type: 'fuel_avg', name: 'Fuel Average (5 Laps)', idleCapable: false, config: NO_CONFIG },
  fuel_stint_avg: { type: 'fuel_stint_avg', name: 'Fuel Stint Average', idleCapable: false, config: NO_CONFIG },
  fuel_last_lap: { type: 'fuel_last_lap', name: 'Fuel Last Lap', idleCapable: false, config: NO_CONFIG },
  fuel_this_lap: { type: 'fuel_this_lap', name: 'Fuel This Lap', idleCapable: false, config: NO_CONFIG },
  fuel_percent: { type: 'fuel_percent', name: 'Fuel Percent', idleCapable: true, config: NO_CONFIG },
  range: { type: 'range', name: 'Range', idleCapable: false, config: NO_CONFIG },
  fuel_ve: { type: 'fuel_ve', name: 'Fuel + VE', idleCapable: false, config: NO_CONFIG },
  pit_window: { type: 'pit_window', name: 'Pit Window', idleCapable: false, config: NO_CONFIG },
  fuel_time: { type: 'fuel_time', name: 'Fuel Time Left', idleCapable: false, config: NO_CONFIG },
  laps_left: { type: 'laps_left', name: 'Race Laps Left', idleCapable: false, config: NO_CONFIG },
  refuel: { type: 'refuel', name: 'Refuel', idleCapable: false, config: NO_CONFIG },
  clock: { type: 'clock', name: 'Clock', idleCapable: true, config: NO_CONFIG },
  air_temp: { type: 'air_temp', name: 'Air Temperature', idleCapable: true, config: NO_CONFIG },
  track_temp: { type: 'track_temp', name: 'Track Temperature', idleCapable: true, config: NO_CONFIG },
  rain: { type: 'rain', name: 'Rain', idleCapable: true, config: NO_CONFIG },
  oil_temp: { type: 'oil_temp', name: 'Oil Temperature', idleCapable: true, config: NO_CONFIG },
  water_temp: { type: 'water_temp', name: 'Water Temperature', idleCapable: true, config: NO_CONFIG },
  boost: { type: 'boost', name: 'Boost', idleCapable: false, config: NO_CONFIG },
  torque: { type: 'torque', name: 'Torque', idleCapable: false, config: NO_CONFIG },
  rpm: { type: 'rpm', name: 'RPM', idleCapable: false, config: NO_CONFIG },
  motor_temp: { type: 'motor_temp', name: 'Motor Temperature', idleCapable: true, config: NO_CONFIG },
  motor_water_temp: { type: 'motor_water_temp', name: 'Motor Water Temperature', idleCapable: true, config: NO_CONFIG },
  penalty: { type: 'penalty', name: 'Penalties', idleCapable: false, config: NO_CONFIG },
  tyre_wear: { type: 'tyre_wear', name: 'Tyre Wear', idleCapable: true, config: NO_CONFIG },
  sector_time: { type: 'sector_time', name: 'Sector Time', idleCapable: false, config: NO_CONFIG },
}

/** Single source of truth for the widget type list — do not redefine it locally; see the section comment above. */
export const ALL_WIDGET_TYPES: readonly DashWidgetType[] = dashboardWidgetTypes

export const widgetDefinition = (type: string): DashWidgetDefinition | null => (isDashWidgetType(type) ? WIDGET_CATALOG[type] : null)

export const widgetDisplayName = (type: string): string => widgetDefinition(type)?.name ?? type

/** The label of the option a widget picked for one of its select fields; null when it has none. */
function chosenOptionLabel(widget: DashWidget, key: string): string | null {
  const field = widgetDefinition(widget.type)?.config.find((candidate) => candidate.key === key)
  if (!field) return null
  const raw = widget.config?.[key]
  const value = typeof raw === 'string' ? raw : field.default
  return field.options.find((option) => option.value === value)?.label ?? null
}

/**
 * What one placed widget is called in the designer (sidebar, canvas tag, inspector): its catalog
 * name, or what it shows when its config makes the catalog name ambiguous ("Front left tyre").
 */
export function widgetName(widget: DashWidget): string {
  const name = widgetDisplayName(widget.type)
  switch (widget.type) {
    case 'tyre': {
      const corner = chosenOptionLabel(widget, 'corner')
      return corner ? `${corner} tyre` : name
    }
    default:
      return name
  }
}

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

/** Whether a widget may sit at `rect`: inside the grid. */
export const fitsLayout = (layout: LayoutGrid, rect: GridRect): boolean => isValidRect(rect, layout.gridCols, layout.gridRows)

/** Whether every widget on the page sits where `fitsLayout` allows and shares cells only as `pageOverlaps` allows. */
export function pageFits(page: DashPage, layout: LayoutGrid): boolean {
  return page.widgets.every((widget) => fitsLayout(layout, widget) && !pageOverlaps(page, widget, widget.id, widget.group ?? null))
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

/** A new widget's size: two cells by one on a dash with its own tracks (its cells are big), else the even grid's default. */
const newWidgetSpan = (layout: LayoutGrid): { colSpan: number; rowSpan: number } =>
  layout.colSizes
    ? { colSpan: Math.min(2, layout.gridCols), rowSpan: 1 }
    : { colSpan: Math.min(DEFAULT_WIDGET_COL_SPAN, layout.gridCols), rowSpan: Math.min(DEFAULT_WIDGET_ROW_SPAN, layout.gridRows) }

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

  // The first free spot that holds the widget's smallest form: at the size it needs inside the
  // dash, else at any smaller-to-larger size, so a gap smaller than the default still takes it.
  const occupied = (candidate: GridRect): boolean => pageOverlaps(page, candidate, '', target.group) || !holdsSmallestAt(next, type, candidate)
  const inside = { col: Math.min(1, next.gridCols - 1), row: Math.min(1, next.gridRows - 1), ...newWidgetSpan(next) }
  const spans = [growToSmallest(next, type, inside, { hx: 1, hy: 1 }), ...spansBySize(next)]
  const search = (within?: GridRect): GridRect | null =>
    spans.reduce<GridRect | null>((found, span) => found ?? firstFit(next.gridCols, next.gridRows, span.colSpan, span.rowSpan, occupied, within), null)
  const rect = (target.within && search(target.within)) || search()
  if (!rect) return null

  const widget = newWidget(page, type, rect, target.group)
  page.widgets.push(widget)
  return { layout: next, widget }
}


/** Where a new widget of `type` dropped on cell (`col`, `row`) goes: the default size from that cell, pulled back inside the grid and grown to hold its smallest form. */
export function newWidgetRect(layout: DashLayout, type: string, col: number, row: number): GridRect {
  const { colSpan, rowSpan } = newWidgetSpan(layout)
  const rect = { col: Math.max(0, Math.min(col, layout.gridCols - colSpan)), row: Math.max(0, Math.min(row, layout.gridRows - rowSpan)), colSpan, rowSpan }
  return growToSmallest(layout, type, rect, { hx: 1, hy: 1 })
}

/** A rect's box at 800x480, measured on the dash's own screen the way the renderer picks a widget's form. */
export function widgetBox(layout: DashLayout, rect: GridRect): { width: number; height: number } {
  const screen = layoutScreenProfile(layout)
  return referenceSize(screen.width, screen.height, layoutRect(layout, screen.width, screen.height, rect))
}

/** The form a widget of `type` draws at `rect`, and whether it is the smallest of several. */
export function widgetFormAt(layout: DashLayout, type: string, rect: GridRect): { form: WidgetForm; smallest: boolean; several: boolean } {
  const forms = widgetForms(type)
  const box = widgetBox(layout, rect)
  const index = formIndex(type, box.width, box.height)
  return { form: forms[index] ?? { width: 0, height: 0 }, smallest: index === forms.length - 1, several: forms.length > 1 }
}

/**
 * `rect` grown cell by cell until it holds the smallest form of a widget of `type`. Only the axes
 * `toward` moves grow (`hx`/`hy` 0 leaves that axis as it is): toward its side, or the other way
 * at the grid's edge. A rect the whole grid cannot make big enough ends at the grid's size.
 */
export function growToSmallest(layout: DashLayout, type: string, rect: GridRect, toward: ResizeHandle): GridRect {
  const forms = widgetForms(type)
  const smallest = forms[forms.length - 1]
  if (!smallest) return rect
  let next = rect
  const box = (): { width: number; height: number } => widgetBox(layout, next)
  while (toward.hx !== 0 && box().width < smallest.width - 0.5 && next.colSpan < layout.gridCols) {
    const left = toward.hx < 0 ? next.col > 0 : next.col + next.colSpan >= layout.gridCols
    next = left ? { ...next, col: next.col - 1, colSpan: next.colSpan + 1 } : { ...next, colSpan: next.colSpan + 1 }
  }
  while (toward.hy !== 0 && box().height < smallest.height - 0.5 && next.rowSpan < layout.gridRows) {
    const up = toward.hy < 0 ? next.row > 0 : next.row + next.rowSpan >= layout.gridRows
    next = up ? { ...next, row: next.row - 1, rowSpan: next.rowSpan + 1 } : { ...next, rowSpan: next.rowSpan + 1 }
  }
  return next
}

/** Whether `rect` holds the smallest form of a widget of `type`. */
export const holdsSmallestAt = (layout: DashLayout, type: string, rect: GridRect): boolean => holdsSmallest(type, widgetBox(layout, rect))

/** Every span a widget could take on `layout`'s grid, smallest first (the wider of two the same size first). */
function spansBySize(layout: LayoutGrid): Array<{ colSpan: number; rowSpan: number }> {
  const spans: Array<{ colSpan: number; rowSpan: number }> = []
  for (let colSpan = 1; colSpan <= layout.gridCols; colSpan++) {
    for (let rowSpan = 1; rowSpan <= layout.gridRows; rowSpan++) spans.push({ colSpan, rowSpan })
  }
  return spans.sort((a, b) => a.colSpan * a.rowSpan - b.colSpan * b.rowSpan || a.rowSpan - b.rowSpan)
}

/**
 * Where a new widget of `type` dropped on cell (`col`, `row`) lands: its default size from that
 * cell (`newWidgetRect`) when that is free, else the smallest free rect over the cell that holds its
 * smallest form, so a drop into a gap smaller than the default still takes. Null when the cell is
 * taken or no free rect over it holds the widget: a drop never jumps somewhere else.
 */
export function dropRect(layout: DashLayout, pageId: string, type: string, col: number, row: number, group: string | null = null): GridRect | null {
  const page = findPage(layout, pageId)
  if (!page) return null
  const free = (rect: GridRect): boolean => fitsLayout(layout, rect) && !pageOverlaps(page, rect, '', group)
  const preferred = newWidgetRect(layout, type, col, row)
  if (free(preferred)) return preferred
  // Every rect tried below holds the dropped cell: when the cell itself is taken, none is free.
  if (!free({ col, row, colSpan: 1, rowSpan: 1 })) return null
  for (const { colSpan, rowSpan } of spansBySize(layout)) {
    for (let up = 0; up < rowSpan; up++) {
      for (let back = 0; back < colSpan; back++) {
        const rect = { col: col - back, row: row - up, colSpan, rowSpan }
        if (free(rect) && holdsSmallestAt(layout, type, rect)) return rect
      }
    }
  }
  return null
}

/** Adds a widget dropped on a grid cell (drag-drop placement) where `dropRect` puts it; null when it does not fit there. */
export function addWidgetAt(layout: DashLayout, pageId: string, type: DashWidgetType, col: number, row: number, group: string | null = null): { layout: DashLayout; widget: DashWidget } | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const rect = dropRect(next, pageId, type, col, row, group)
  if (!page || !rect) return null

  const widget = newWidget(page, type, rect, group)
  page.widgets.push(widget)
  return { layout: next, widget }
}

export type ResizeHandle = { hx: -1 | 0 | 1; hy: -1 | 0 | 1 }

/** Snaps a pointer-drag delta (in whole grid cells) onto a moved widget's rectangle, clamped to the grid — mirrors the old Avalonia editor's `PreviewGeometry` move branch. Pure pixel/grid math for the widget canvas. */
export function previewMoveRect(start: GridRect, deltaCol: number, deltaRow: number, cols: number, rows: number): GridRect {
  const col = Math.max(0, Math.min(start.col + deltaCol, Math.max(0, cols - start.colSpan)))
  const row = Math.max(0, Math.min(start.row + deltaRow, Math.max(0, rows - start.rowSpan)))
  return { col, row, colSpan: start.colSpan, rowSpan: start.rowSpan }
}

/** Snaps a pointer-drag delta onto a resized widget's rectangle for one of 8 edge/corner handles, clamped to the grid and to a minimum span of one cell — mirrors the old editor's `ResizeGeometry`. */
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
  if (!page || !widget || !fitsLayout(next, rect) || pageOverlaps(page, rect, widget.id, widget.group ?? null)) return null
  Object.assign(widget, rect)
  return next
}

/**
 * Swaps two widgets' places: each takes the other's cells. Refused when either would not fit there
 * (`pageFits`: its zone, or an overlap a different size makes).
 */
export function swapWidgets(layout: DashLayout, pageId: string, firstId: string, secondId: string): DashLayout | null {
  const next = cloneLayout(layout)
  const page = findPage(next, pageId)
  const first = page?.widgets.find((item) => item.id === firstId)
  const second = page?.widgets.find((item) => item.id === secondId)
  if (!page || !first || !second || first === second) return null
  const firstRect: GridRect = { col: first.col, row: first.row, colSpan: first.colSpan, rowSpan: first.rowSpan }
  Object.assign(first, { col: second.col, row: second.row, colSpan: second.colSpan, rowSpan: second.rowSpan })
  Object.assign(second, firstRect)
  return pageFits(page, next) ? next : null
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

/** A setting's value on a widget: what the widget says, else the field's default. */
export function configValue(config: Readonly<Record<string, unknown>>, field: DashConfigField): string {
  const raw = config[field.key]
  return typeof raw === 'string' && raw !== '' ? raw : field.default
}

/** The switch a setting needs that is off on this widget, so the setting changes nothing; null when it applies. */
export function blockedBy(config: Readonly<Record<string, unknown>>, field: DashConfigField, fields: readonly DashConfigField[]): DashConfigField | null {
  const needed = field.needs === undefined ? undefined : fields.find((candidate) => candidate.key === field.needs)
  return needed !== undefined && configValue(config, needed) !== 'on' ? needed : null
}

/** Sets a switch config field on or off; the field's default is not written (switching back clears it). */
export function setWidgetSwitch(layout: DashLayout, pageId: string, widgetId: string, field: DashConfigField, on: boolean): DashLayout | null {
  const value = on ? 'on' : 'off'
  return setWidgetConfig(layout, pageId, widgetId, field.key, value === field.default ? '' : value)
}

/**
 * Turns a widget's label or frame on or off: the only look a widget has of its own (Sprint draws
 * the rest). On is the default and is not written; null when nothing changes.
 */
export function setWidgetLook(layout: DashLayout, pageId: string, widgetId: string, part: keyof DashWidgetStyle, on: boolean): DashLayout | null {
  if ((findWidget(layout, pageId, widgetId)?.style?.[part] !== 'off') === on) return null
  return withWidget(layout, pageId, widgetId, (widget) => {
    const style: DashWidgetStyle = { ...widget.style }
    if (on) delete style[part]
    else style[part] = 'off'
    widget.style = Object.keys(style).length > 0 ? style : undefined
  })
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
