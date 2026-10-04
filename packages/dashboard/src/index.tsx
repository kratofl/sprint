import React, { useState } from 'react'
import type { TelemetryFrame } from '@sprint/types'
import { DashRenderer, type DashRendererProps } from './DashRenderer'

export type DashColorSystem = 'functional' | 'styled'
export interface DashTheme { [key: string]: string | undefined }
export interface DashWidgetStyle { textColor?: string; labelColor?: string; border?: boolean }
export interface DashWidget { id: string; type: string; col: number; row: number; colSpan: number; rowSpan: number; config?: Record<string, unknown>; style?: DashWidgetStyle }
export interface DashWidgetStackLayer { id: string; name: string; widgets: DashWidget[] }
export interface DashWidgetStack { id: string; name: string; col: number; row: number; colSpan: number; rowSpan: number; defaultLayerId?: string; layers: DashWidgetStackLayer[] }
export interface DashPage { id: string; name: string; widgets: DashWidget[]; widgetStacks?: DashWidgetStack[] }
export interface DashAlert { id: string; type: string; enabled: boolean; col: number; row: number; colSpan: number; rowSpan: number; colorToken?: string; durationSeconds?: number; invertColors?: boolean }
export interface DashLayout { id: string; name: string; default: boolean; mode: string; colorSystem?: DashColorSystem; screenProfile?: string; gridCols: number; gridRows: number; pages: DashPage[]; idlePage?: DashPage | null; alerts: DashAlert[]; theme?: DashTheme; alertConfig?: Record<string, unknown> }
export interface DashRenderInput { layout: DashLayout; frame?: TelemetryFrame | null; width?: number; height?: number; pageId?: string; idle?: boolean; settings?: Record<string, unknown>; targets?: Record<string, unknown> }

export { DashRenderer, type DashRendererProps }
export { dashboardWidgetTypes, isDashWidgetType, type DashWidgetType } from './widgets'
// Palette and alert behaviour are part of the package's public contract: the
// desktop editor picks colours and alert conditions from these same lists, so a
// consumer never has to keep its own copy in step.
export {
  defaultDashPalette, resolveDashPalette, styleColorTokens, resolveStyleColor,
  resolveTyreColor, dimColor, withAlpha, dashThemePresets, presetSwatchColor,
  canonicalAlertColorToken, matchLayoutThemeName, type DashPaletteColors, type DashThemePreset,
} from './palette'
export { DashAlertTracker, isAttentionInverted, dashAlertTypes, type DashCondition, type DashAlertBanner, type DashAlertType } from './alerts'
// Grid pixel math is part of the public contract too: the desktop editor's direct-manipulation
// overlay (drag/resize handles) positions itself with the exact same math `DashRenderer` uses to
// place widgets, so the overlay can never drift a pixel out of alignment with what's rendered.
export { gridRect, type PixelRect, type GridSpan } from './grid'
export { dashPreviewStates, previewFrame, resolvePreviewFrame, type DashPreviewState } from './previewFrames'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isWidget = (value: unknown): value is DashWidget => isRecord(value) && typeof value.id === 'string' && typeof value.type === 'string' && typeof value.col === 'number' && typeof value.row === 'number' && typeof value.colSpan === 'number' && typeof value.rowSpan === 'number'
const isPage = (value: unknown): value is DashPage => isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.widgets) && value.widgets.every(isWidget)
const isTelemetryFrame = (value: unknown): value is TelemetryFrame => isRecord(value) && isRecord(value.session) && isRecord(value.car) && isRecord(value.lap) && isRecord(value.flags) && isRecord(value.electronics) && isRecord(value.race) && isRecord(value.energy)
export function parseDashRenderInput(value: unknown): DashRenderInput {
  if (!isRecord(value) || !isRecord(value.layout)) throw new TypeError('Invalid dashboard render input')
  const raw = value.layout
  // Narrowed through its own binding: a predicate applied to `value.layout.pages`
  // does not survive the re-read through `raw`.
  const pages = raw.pages
  if (!Array.isArray(pages) || !pages.every(isPage)) throw new TypeError('Invalid dashboard render input')
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.gridCols !== 'number' || typeof raw.gridRows !== 'number') throw new TypeError('Invalid dashboard layout')
  const layout: DashLayout = { id: raw.id, name: raw.name, default: raw.default === true, mode: typeof raw.mode === 'string' ? raw.mode : 'basic', gridCols: raw.gridCols, gridRows: raw.gridRows, pages, alerts: Array.isArray(raw.alerts) ? raw.alerts.filter((alert): alert is DashAlert => isRecord(alert) && typeof alert.id === 'string' && typeof alert.type === 'string') : [] }
  if (isPage(raw.idlePage)) layout.idlePage = raw.idlePage
  if (isRecord(raw.theme)) layout.theme = Object.fromEntries(Object.entries(raw.theme).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  if (isRecord(raw.alertConfig)) layout.alertConfig = raw.alertConfig
  if (typeof raw.colorSystem === 'string' && (raw.colorSystem === 'functional' || raw.colorSystem === 'styled')) layout.colorSystem = raw.colorSystem
  if (typeof raw.screenProfile === 'string') layout.screenProfile = raw.screenProfile
  return { layout, frame: isTelemetryFrame(value.frame) ? value.frame : null, pageId: typeof value.pageId === 'string' ? value.pageId : undefined, idle: value.idle === true, width: typeof value.width === 'number' ? value.width : undefined, height: typeof value.height === 'number' ? value.height : undefined, settings: isRecord(value.settings) ? value.settings : undefined, targets: isRecord(value.targets) ? value.targets : undefined }
}

export interface DashEditorProps extends DashRendererProps { onChange: (layout: DashLayout) => void; onSave?: () => void }

/**
 * A minimal layout editor: the shared `DashRenderer` preview plus an inspector for the
 * selected widget's grid placement. Selection/inspector state lives here, not in the
 * renderer — `DashRenderer` stays a pure function of its props so it renders identically
 * whether the editor, an on-screen display, or an offscreen capture is driving it.
 */
export function DashEditor({ layout, onChange, onSave, ...props }: DashEditorProps): React.ReactElement {
  const [selected, setSelected] = useState<string | undefined>(props.selectedId)
  const page = layout.pages[0]
  const selectedWidget = page?.widgets.find((widget) => widget.id === selected)
  const update = (patch: Partial<DashWidget>): void => {
    if (!selectedWidget || !page) return
    onChange({ ...layout, pages: layout.pages.map((p) => (p.id === page.id ? { ...p, widgets: p.widgets.map((w) => (w.id === selected ? { ...w, ...patch } : w)) } : p)) })
  }

  return (
    <div className="dash-editor">
      <DashRenderer {...props} layout={layout} selectedId={selected} onWidgetSelect={(widget) => setSelected(widget.id)} />
      <aside className="dash-inspector">
        <strong>{selectedWidget ? selectedWidget.type : 'Select a widget'}</strong>
        {selectedWidget && (
          <>
            <label>Column<input type="number" value={selectedWidget.col} onChange={(e) => update({ col: Number(e.target.value) })} /></label>
            <label>Row<input type="number" value={selectedWidget.row} onChange={(e) => update({ row: Number(e.target.value) })} /></label>
            <label>Width<input type="number" value={selectedWidget.colSpan} onChange={(e) => update({ colSpan: Math.max(1, Number(e.target.value)) })} /></label>
            <label>Height<input type="number" value={selectedWidget.rowSpan} onChange={(e) => update({ rowSpan: Math.max(1, Number(e.target.value)) })} /></label>
            <button
              type="button"
              onClick={() => page && onChange({ ...layout, pages: layout.pages.map((p) => (p.id === page.id ? { ...p, widgets: p.widgets.filter((w) => w.id !== selected) } : p)) })}
            >
              Delete
            </button>
          </>
        )}
        <button type="button" onClick={onSave}>Save</button>
      </aside>
    </div>
  )
}
