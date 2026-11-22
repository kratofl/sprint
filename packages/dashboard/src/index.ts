// The wheel dash, as the desktop app sees it: the layout model and its narrowing, what the editor
// reads to build its UI (widget types, palette and theme presets, alert looks, grid math, groups,
// preview frames), and `DashCanvas`, which draws a dash with the Rust renderer
// (packages/dashboard/renderer) compiled to WebAssembly. The wheel itself is drawn by the same
// renderer, natively, in the host.

import type { DashAlertDisplayMode } from './alerts'
import type { DashLapReview } from './lapReview'
import type { DashPitLimiter } from './pitLimiter'

export type DashColorSystem = 'functional' | 'styled'
/**
 * The driver's measurement system (host `AppSettings.Units`, by name): every speed, temperature,
 * pressure and fuel volume a dash prints is in it (the renderer's `Units`). Imperial is US
 * customary: mph, °F, psi and US gallons.
 */
export type DashUnits = 'Metric' | 'Imperial'
export interface DashTheme { [key: string]: string | undefined }
/** A frame's edge. */
export type DashBorder = 'none' | 'thin' | 'normal' | 'thick'
export const dashBorders: readonly DashBorder[] = ['none', 'thin', 'normal', 'thick']
export const isDashBorder = (value: unknown): value is DashBorder => dashBorders.some((border) => border === value)
/** Where a dash puts its widgets' labels: none, top left in the edge (`on`, "Top"), centred above the value (`top`, "Center"), beside it at the left or right, or in a band across its top. */
export type DashLabelMode = 'off' | 'on' | 'top' | 'left' | 'right' | 'capsule'
export const dashLabelModes: readonly DashLabelMode[] = ['off', 'on', 'top', 'left', 'right', 'capsule']
export const isDashLabelMode = (value: unknown): value is DashLabelMode => dashLabelModes.some((mode) => mode === value)
/** A group frame's name: none, set into the top edge, or in a pill. */
export type DashGroupLabel = 'off' | 'on' | 'capsule'
export const dashGroupLabels: readonly DashGroupLabel[] = ['off', 'on', 'capsule']
export const isDashGroupLabel = (value: unknown): value is DashGroupLabel => dashGroupLabels.some((label) => label === value)
/** A dash's look, the only one: corner radius (px at 800x480), its edge and where its labels sit. */
export interface DashChrome { radius: number; border: DashBorder; label: DashLabelMode }
/** The look a dash without `chrome` gets (the renderer's `DashChrome::default`). */
export const DEFAULT_DASH_CHROME: DashChrome = { radius: 6, border: 'normal', label: 'on' }
/** The label spots a widget may move its own label to; a band (`capsule`) is the dash's alone. */
export type DashWidgetLabel = Exclude<DashLabelMode, 'capsule'>
export const isDashWidgetLabel = (value: unknown): value is DashWidgetLabel => value !== 'capsule' && isDashLabelMode(value)
/** What one widget changes of the dash's look: only where its label sits. Colours follow meaning, not the widget. */
export interface DashWidgetStyle { label?: DashWidgetLabel }
/** A group's own frame round its widgets, its name as the label, at the left or centred. */
export interface DashGroupStyle { border: DashBorder; label: DashGroupLabel; align?: 'start' | 'center' }
/** One widget, in page grid coordinates. `group` is the group it sits in; `hidden` keeps it off the wheel (it still holds its cells). */
export interface DashWidget { id: string; type: string; col: number; row: number; colSpan: number; rowSpan: number; config?: Record<string, unknown>; style?: DashWidgetStyle; group?: string; hidden?: boolean }
/** How a group shows its direct children: all of them, or one at a time (a widget stack: each child is a layer). */
export type DashGroupMode = 'together' | 'oneAtATime'
export const isDashGroupMode = (value: unknown): value is DashGroupMode => value === 'together' || value === 'oneAtATime'
/**
 * A named group of widgets and groups on a page (see `groups.ts` for the tree and the drawing
 * rule). `parent` is the group it sits in; `shownFirst` is the child a one-at-a-time group shows.
 */
export interface DashWidgetGroup { id: string; name: string; parent?: string; mode: DashGroupMode; shownFirst?: string; hidden?: boolean; style?: DashGroupStyle }
/**
 * When the wheel switches to a page by itself (host `DashPageJump`): leaving the pit lane
 * (`outLap`), or crossing the line on track (`flyingLap`).
 */
export type DashPageJump = 'outLap' | 'flyingLap'
/**
 * `showIn` lists the sessions (`practice`, `qualifying`, `race`) and the driver's own mode ids the
 * wheel cycles the page in; absent means every session. `jump`: when the wheel shows it by itself.
 * The renderer ignores both.
 */
export interface DashPage { id: string; name: string; widgets: DashWidget[]; groups?: DashWidgetGroup[]; showIn?: string[]; jump?: DashPageJump }
/**
 * One alert on a dash, as the host stamps the app-wide alert settings onto it
 * (`dashAlertFromSettings`). The look fields (`displayMode`, `colorToken`, `durationSeconds`,
 * `invertColors`) are the alert's own look; all absent means it uses the layout's `alertConfig`.
 * `displayMode` "full" shows the popup over the whole dash, "strip" as a band across its middle,
 * "center" in the alert's grid rect. `untilAck` keeps it up until the driver acknowledges it.
 * The rest are a type's own settings (`DashAlertSettings`): `lapsLeft`/`warningLapsLeft` are
 * `fuel_low`'s two levels, `waterLimitCelsius`/`oilLimitCelsius` `engine_warning`'s limits, the
 * launch window `launch`'s and `liftPoint` `lift_now`'s; the widgets warn from them too.
 */
export interface DashAlert {
  id: string; type: string; enabled: boolean; col: number; row: number; colSpan: number; rowSpan: number
  displayMode?: DashAlertDisplayMode; colorToken?: string; durationSeconds?: number; invertColors?: boolean; untilAck?: boolean
  lapsLeft?: number; warningLapsLeft?: number; waterLimitCelsius?: number; oilLimitCelsius?: number
  clutchPercent?: number; speedKmh?: number; rpmFrom?: number; rpmTo?: number; throttleFrom?: number; throttleTo?: number; liftPoint?: number
}
/**
 * `category` is the Dashes page grouping (host `DashLayout.Category`); absent means "Other". The
 * renderer ignores it. `colSizes`/`rowSizes`: the dash's own column widths and row heights, as
 * shares (one per `gridCols`/`gridRows`); absent on older dashes, whose grid is even and refits to
 * its screen. `chrome`: the flat style's look.
 * `lapReview`: the lap review's six cells (`lapReviewCells` reads them); absent shows the defaults.
 * `pitLimiter`: the overlay shown while the pit limiter is on (`pitLimiterOf` reads it); absent
 * shows the default style with no widgets of its own.
 */
export interface DashLayout { id: string; name: string; category?: string; mode: string; colorSystem?: DashColorSystem; chrome?: DashChrome; colSizes?: number[]; rowSizes?: number[]; screenProfile?: string; gridCols: number; gridRows: number; pages: DashPage[]; idlePage?: DashPage | null; alerts: DashAlert[]; theme?: DashTheme; alertConfig?: Record<string, unknown>; lapReview?: DashLapReview; pitLimiter?: DashPitLimiter }

export { DashCanvas, DashUnitsContext, type DashCanvasProps } from './DashCanvas'
export { dashboardWidgetTypes, isDashWidgetType, type DashWidgetType } from './widgetTypes'
// Palette and alert looks are part of the package's public contract: the desktop editor picks
// colours and alert looks from these same lists, so a consumer never keeps its own copy in step.
export {
  resolveDashPalette, dashThemePresets, dashSettingColors,
  matchLayoutThemeName, type DashPaletteColors, type DashThemePreset,
} from './palette'
export {
  dashAlertTypes, isDashAlertType, dashAlertDefaults, dashAlertFromSettings, previewAlertBanner, alertColorSwatch, maxAlertSeconds,
  LAP_SUMMARY_SECONDS, LAP_SUMMARY_MAX_SECONDS, MIN_ALERT_SECONDS, MAX_ALERT_SECONDS, FUEL_LAPS_LEFT_MIN, FUEL_LAPS_LEFT_MAX,
  ENGINE_LIMIT_MIN, ENGINE_LIMIT_MAX, LIFT_POINT_MIN, LIFT_POINT_MAX, LAUNCH_RANGES,
  type DashAlertBanner, type DashLaunchWindow, type DashAlertType, type DashAlertSize, type DashAlertDisplayMode, type DashAlertSettings, type DashAlertPopup,
  type DashAlertPlacement, type DashLapSummaryPopup, type DashLapSector, type DashSectorRating,
} from './alerts'
export { dashLapReviewFields, isDashLapReviewField, lapReviewCells, DEFAULT_LAP_REVIEW_CELLS, LAP_REVIEW_TOP_SHARE, type DashLapReviewField, type DashLapReview } from './lapReview'
export {
  dashPitLimiterStyles, isDashPitLimiterStyle, pitLimiterOf, pitLimiterStyle, pageGear, pitLimiterCovers, DEFAULT_PIT_LIMITER_STYLE,
  type DashPitLimiterStyle, type DashPitLimiter,
} from './pitLimiter'
export { multiDialInk, multiDialSwatches, type DashMultiDialPopup } from './multiDial'
// The editor's direct-manipulation overlay (drag/resize handles) positions itself with the same
// grid math the renderer places widgets with, so it never drifts a pixel from what is drawn.
export { gridRect, trackRect, tracksOf, layoutRect, gridLines, cellAt, type PixelRect, type GridSpan, type LayoutGrid, type Tracks } from './grid'
export { widgetForms, formIndex, referenceSize, holdsSmallest, hasLabel, type WidgetForm } from './widgetForms'
export { pageTree, shownChild, nodeWidgets, drawnWidgets, groupParents, stackLayers, mayOverlap, type DashNode, type DashGroupNode } from './groups'
export { dashPreviewStates, previewFrame, resolvePreviewFrame, type DashPreviewState } from './previewFrames'
// The host's telemetry JSON is what the renderer reads; the app's views read the @sprint/types mirror.
export { parseHostFrame, toHostFrame, type HostTelemetryFrame } from './hostFrame'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isOptional = (value: unknown, type: 'string' | 'boolean'): boolean => value === undefined || typeof value === type
const isDashGroupStyle = (value: unknown): value is DashGroupStyle =>
  isRecord(value) && isDashBorder(value.border) && isDashGroupLabel(value.label) && (value.align === undefined || value.align === 'start' || value.align === 'center')
/** A group as the host writes it: absent fields are omitted, never null. */
export const isDashWidgetGroup = (value: unknown): value is DashWidgetGroup =>
  isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && isDashGroupMode(value.mode) && isOptional(value.parent, 'string') && isOptional(value.shownFirst, 'string') && isOptional(value.hidden, 'boolean') && (value.style === undefined || isDashGroupStyle(value.style))
/** The flat style's dash-wide look, narrowed from a host row; null when it is not one. */
export const parseDashChrome = (value: unknown): DashChrome | null =>
  isRecord(value) && typeof value.radius === 'number' && value.radius >= 0 && isDashBorder(value.border) && isDashLabelMode(value.label) ? { radius: value.radius, border: value.border, label: value.label } : null
