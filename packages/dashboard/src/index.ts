// The wheel dash, as the desktop app sees it: the layout model and its narrowing, what the editor
// reads to build its UI (widget types, palette and theme presets, alert looks, grid math, groups,
// preview frames), and `DashCanvas`, which draws a dash with the Rust renderer
// (packages/dashboard/renderer) compiled to WebAssembly. The wheel itself is drawn by the same
// renderer, natively, in the host.

export type DashColorSystem = 'functional' | 'styled'
/**
 * How every widget on a dash is framed and titled: separate rounded panels, one ruled grid,
 * or panels with a title bar. Independent of layout: switching it never moves or resizes a
 * widget, and condition colors read the same in each.
 */
export type DashStyle = 'panels' | 'grid' | 'bars'
export const dashStyles: readonly DashStyle[] = ['panels', 'grid', 'bars']
export const isDashStyle = (value: unknown): value is DashStyle => value === 'panels' || value === 'grid' || value === 'bars'
export interface DashTheme { [key: string]: string | undefined }
export interface DashWidgetStyle { textColor?: string; labelColor?: string }
/** One widget, in page grid coordinates. `group` is the group it sits in; `hidden` keeps it off the wheel (it still holds its cells). */
export interface DashWidget { id: string; type: string; col: number; row: number; colSpan: number; rowSpan: number; config?: Record<string, unknown>; style?: DashWidgetStyle; group?: string; hidden?: boolean }
/** How a group shows its direct children: all of them, or one at a time (a widget stack: each child is a layer). */
export type DashGroupMode = 'together' | 'oneAtATime'
export const isDashGroupMode = (value: unknown): value is DashGroupMode => value === 'together' || value === 'oneAtATime'
/**
 * A named group of widgets and groups on a page (see `groups.ts` for the tree and the drawing
 * rule). `parent` is the group it sits in; `shownFirst` is the child a one-at-a-time group shows.
 */
export interface DashWidgetGroup { id: string; name: string; parent?: string; mode: DashGroupMode; shownFirst?: string; hidden?: boolean }
export interface DashPage { id: string; name: string; widgets: DashWidget[]; groups?: DashWidgetGroup[] }
/**
 * One alert on a dash. The look fields (`displayMode`, `colorToken`, `durationSeconds`,
 * `invertColors`) are the alert's own look; all absent means it uses the layout's `alertConfig`.
 * `displayMode` "center" shows the popup in the alert's grid rect, "full" over the whole dash.
 */
export interface DashAlert { id: string; type: string; enabled: boolean; col: number; row: number; colSpan: number; rowSpan: number; displayMode?: 'full' | 'center'; colorToken?: string; durationSeconds?: number; invertColors?: boolean }
/** `category` is the Dashes page grouping (host `DashLayout.Category`); absent means "Other". The renderer ignores it. */
export interface DashLayout { id: string; name: string; category?: string; mode: string; colorSystem?: DashColorSystem; dashStyle?: DashStyle; screenProfile?: string; gridCols: number; gridRows: number; pages: DashPage[]; idlePage?: DashPage | null; alerts: DashAlert[]; theme?: DashTheme; alertConfig?: Record<string, unknown> }

export { DashCanvas, type DashCanvasProps } from './DashCanvas'
export { dashboardWidgetTypes, isDashWidgetType, type DashWidgetType } from './widgetTypes'
// Palette and alert looks are part of the package's public contract: the desktop editor picks
// colours and alert looks from these same lists, so a consumer never keeps its own copy in step.
export {
  resolveDashPalette, styleColorTokens, resolveStyleColor, dashThemePresets, dashSettingColors,
  matchLayoutThemeName, type DashPaletteColors, type DashThemePreset,
} from './palette'
export { dashAlertTypes, previewAlertBanner, alertColorSwatch, LAP_SUMMARY_SECONDS, type DashAlertBanner, type DashAlertType, type DashSettingPopup, type DashLapSummaryPopup } from './alerts'
export { multiDialInk, multiDialSwatches, MULTI_DIAL_POPUP_SECONDS, type DashMultiDialPopup } from './multiDial'
// The editor's direct-manipulation overlay (drag/resize handles) positions itself with the same
// grid math the renderer places widgets with, so it never drifts a pixel from what is drawn.
export { gridRect, type PixelRect, type GridSpan } from './grid'
export { pageTree, shownChild, nodeWidgets, drawnWidgets, groupParents, stackLayers, mayOverlap, type DashNode, type DashGroupNode } from './groups'
export { dashPreviewStates, previewFrame, resolvePreviewFrame, type DashPreviewState } from './previewFrames'
// The host's telemetry JSON is what the renderer reads; the app's views read the @sprint/types mirror.
export { parseHostFrame, toHostFrame, type HostTelemetryFrame } from './hostFrame'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isOptional = (value: unknown, type: 'string' | 'boolean'): boolean => value === undefined || typeof value === type
/** A group as the host writes it: absent fields are omitted, never null. */
export const isDashWidgetGroup = (value: unknown): value is DashWidgetGroup => isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && isDashGroupMode(value.mode) && isOptional(value.parent, 'string') && isOptional(value.shownFirst, 'string') && isOptional(value.hidden, 'boolean')
