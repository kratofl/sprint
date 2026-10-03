import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { ArrowLeft, Check, Grid2x2, GripVertical, Layers, Minus, Plus, RotateCcw, Save, Star, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { DashRenderer, dashPreviewStates, dashThemePresets, gridRect, isDashWidgetType, matchLayoutThemeName, presetSwatchColor, resolvePreviewFrame } from '@sprint/dashboard'
import type { DashLayout, DashPage, DashWidget, DashWidgetStack, DashWidgetType, PixelRect } from '@sprint/dashboard'
import type { DashPreviewState } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import type { SprintCommand } from '../bridge'
import { ConfirmDialog } from '../shell/ContentDialog'
import { CommandDivider, PageHeader } from '../shell/PageHeader'
import { Status } from '../shell/Status'
import {
  ALERT_COLOR_TOKENS,
  ALERT_TYPES,
  ALL_WIDGET_TYPES,
  DEFAULT_WIDGET_COL_SPAN,
  DEFAULT_WIDGET_ROW_SPAN,
  SCREEN_PROFILES,
  WIDGET_STYLE_COLOR_TOKENS,
  addIdlePage,
  addPage,
  addStackLayer,
  addWidget,
  addWidgetAt,
  addWidgetStack,
  addWidgetToStackLayer,
  applyThemePreset,
  buildDashReset,
  buildDashSave,
  buildDashSetScreenProfile,
  canPlaceNewWidget,
  canPlaceWidgetAt,
  clearPage,
  deletePage,
  deleteStackLayer,
  deleteWidgetAt,
  deleteWidgetStack,
  findAlert,
  findPage,
  findWidgetAt,
  findWidgetLocation,
  fitScreenSize,
  globalAlertConfig,
  layoutScreenProfile,
  previewMoveRect,
  previewResizeRect,
  removeIdlePage,
  renameLayout,
  renamePage,
  renameWidgetStack,
  setAlertEnabled,
  setAlertGeometry,
  setAlertOverride,
  setAlertUseGlobal,
  setDefaultStackLayer,
  setGlobalAlertConfig,
  setStackLayerWidgetGeometry,
  setWidgetConfig,
  setWidgetGeometry,
  setWidgetStackGeometry,
  setWidgetStyle,
  widgetDefinition,
  widgetDisplayName,
  type AlertTypeId,
  type GridRect,
  type ResizeHandle,
  type ScreenProfile,
  type WidgetLocation,
} from './DashesDomain'
import './DashEditorPanel.css'

type Section = 'widgets' | 'alerts' | 'theme'

const SECTIONS: readonly { id: Section; label: string }[] = [
  { id: 'widgets', label: 'Pages & widgets' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'theme', label: 'Theme' },
]

// Zoom steps for the canvas view controls (old editor's `ZoomLevels`).
const ZOOM_LEVELS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5]

// The editor canvas at 100% zoom: every screen profile is fitted into this box (narrowed to the
// canvas pane on small windows), so a portrait dash stays as tall as a landscape one instead of
// running off the page. Zoom scales on top of it.
const CANVAS_MAX_WIDTH = 600
const CANVAS_MAX_HEIGHT = 360

// Theme preset previews are fitted into this box.
const THEME_PREVIEW_MAX_WIDTH = 220
const THEME_PREVIEW_MAX_HEIGHT = 132

type PointerPos = { x: number; y: number }

type Apply = (mutate: (current: DashLayout) => DashLayout | null) => void

/**
 * Direct-manipulation state for the widget canvas: idle, a palette item being dragged onto
 * the grid, an existing widget being moved, or an existing widget being resized from one of
 * its 8 edge/corner handles. One `DragState` drives the ghost preview, the validity flash,
 * and the commit-on-release — never a second parallel model of "what's being dragged".
 */
type DragState =
  | { kind: 'idle' }
  | { kind: 'placing'; widgetType: DashWidgetType; pointer: PointerPos | null }
  | { kind: 'moving'; location: WidgetLocation; widgetId: string; start: GridRect; pointerStart: PointerPos; pointer: PointerPos }
  | { kind: 'resizing'; location: WidgetLocation; widgetId: string; handle: ResizeHandle; start: GridRect; pointerStart: PointerPos; pointer: PointerPos }

const RESIZE_HANDLES: readonly ResizeHandle[] = [
  { hx: -1, hy: -1 }, { hx: 0, hy: -1 }, { hx: 1, hy: -1 },
  { hx: -1, hy: 0 }, { hx: 1, hy: 0 },
  { hx: -1, hy: 1 }, { hx: 0, hy: 1 }, { hx: 1, hy: 1 },
]

function handleCursor(handle: ResizeHandle): string {
  if (handle.hx === 0) return 'ns-resize'
  if (handle.hy === 0) return 'ew-resize'
  return handle.hx === handle.hy ? 'nwse-resize' : 'nesw-resize'
}

/** Reads a pointer event's position relative to a ref'd element, in that element's own (unscaled) coordinate space — divides out a CSS `scale()` zoom applied to an ancestor. */
function relativePointerPos(event: ReactPointerEvent, element: HTMLElement, zoom: number): PointerPos {
  const rect = element.getBoundingClientRect()
  return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }
}
type Selection = { location: WidgetLocation; widgetId: string }

/**
 * The content-box width of an element passed in through a callback ref, kept while the element
 * is unmounted (another editor tab) so the canvas size stays stable across tabs.
 */
function useContentWidth(element: HTMLElement | null): number | null {
  const [width, setWidth] = useState<number | null>(null)
  // Measured before paint once, so the canvas never shows a frame at the wrong size; the
  // observer then follows window and pane resizes.
  useLayoutEffect(() => {
    if (!element) return
    const style = window.getComputedStyle(element)
    setWidth(Math.floor(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)))
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return width
}

/**
 * The dash editor: a sub-page of Dashes with the dash name as its title. The CommandBar holds
 * save/discard, the preview state, canvas view controls and reset; tabs switch between pages &
 * widgets, alerts and theme. The widgets tab is three panes: pages, the widget catalogue and
 * widget stacks on the left, the canvas in the middle, and the properties of the selected
 * widget (or of the dash itself) on the right. Edits accumulate in a local draft —
 * `RuntimeCoordinator` has no per-field dash command, so every mutation is a pure
 * `DashesDomain` reducer and the whole layout is written back in one `dash.save` on demand.
 */
export function DashEditorPanel({
  layout,
  frame,
  send,
  onClose,
}: {
  layout: DashLayout
  frame: TelemetryFrame | null
  send: (command: SprintCommand) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(layout)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [activePageId, setActivePageId] = useState(() => layout.pages[0]?.id ?? layout.idlePage?.id ?? '')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [section, setSection] = useState<Section>('widgets')
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [previewState, setPreviewState] = useState<DashPreviewState>('live')
  const [zoom, setZoom] = useState(1)
  const [showGrid, setShowGrid] = useState(false)
  const [dragState, setDragState] = useState<DragState>({ kind: 'idle' })
  const [flash, setFlash] = useState<string | null>(null)
  const flashTimeout = useRef<number | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [wellElement, setWellElement] = useState<HTMLDivElement | null>(null)
  const wellWidth = useContentWidth(wellElement)
  const loadedId = useRef(layout.id)
  const tabsId = useId()

  // A one-shot, non-repeating flash for a rejected drag/resize/drop (docs/DESIGN.md forbids
  // continuously repainting animation) — clears itself a couple of seconds after the last
  // rejection so it never lingers as stale advice.
  const flashValidation = (message: string): void => {
    setFlash(message)
    if (flashTimeout.current !== null) window.clearTimeout(flashTimeout.current)
    flashTimeout.current = window.setTimeout(() => setFlash(null), 2400)
  }

  useEffect(() => {
    if (loadedId.current === layout.id) return
    loadedId.current = layout.id
    setDraft(layout)
    setDirty(false)
    setSaveError(null)
    setActivePageId(layout.pages[0]?.id ?? layout.idlePage?.id ?? '')
    setSelection(null)
    setConfirmingReset(false)
    setConfirmingClose(false)
    setDragState({ kind: 'idle' })
  }, [layout])

  useEffect(() => () => {
    if (flashTimeout.current !== null) window.clearTimeout(flashTimeout.current)
  }, [])

  const apply: Apply = (mutate) => {
    const result = mutate(draft)
    if (result) {
      setDraft(result)
      setDirty(true)
    }
  }

  // Same as `apply`, but for direct-manipulation commits that can be legitimately rejected
  // (an overlapping drop, move, or resize) — surfaces the rejection as a flash instead of
  // silently snapping back with no explanation.
  const applyOrFlash = (mutate: (current: DashLayout) => DashLayout | null, failureMessage: string): void => {
    const result = mutate(draft)
    if (result) {
      setDraft(result)
      setDirty(true)
    } else {
      flashValidation(failureMessage)
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setSaveError(null)
    try {
      await send(buildDashSave(draft.id, draft))
      setDirty(false)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The dash could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = (): void => {
    setDraft(layout)
    setDirty(false)
    setSaveError(null)
    setSelection(null)
  }

  const handleResetToDefaults = async (): Promise<void> => {
    setConfirmingReset(false)
    setSaveError(null)
    try {
      await send(buildDashReset(draft.id))
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The dash could not be reset.')
    }
  }

  // Leaving with unsaved edits asks first (docs/design/design-system/DESIGN.md, Forms & sheets).
  const requestClose = (): void => {
    if (dirty) setConfirmingClose(true)
    else onClose()
  }

  const activePage = findPage(draft, activePageId)
  const profile = layoutScreenProfile(draft)
  const canvasBoxWidth = Math.max(160, Math.min(CANVAS_MAX_WIDTH, wellWidth ?? CANVAS_MAX_WIDTH))
  const { width: canvasWidth, height: canvasHeight } = fitScreenSize(profile, canvasBoxWidth, CANVAS_MAX_HEIGHT)
  const isIdlePage = activePage?.id === draft.idlePage?.id
  const previewFrame = resolvePreviewFrame(previewState, frame)
  // Same fallback as `DashRenderer`'s own cols/rows resolution — the overlay's grid must
  // always match what's actually rendered.
  const cols = draft.gridCols > 0 ? draft.gridCols : 20
  const rows = draft.gridRows > 0 ? draft.gridRows : 12

  const selectedWidget = selection ? findWidgetAt(draft, selection.location, selection.widgetId) : null

  const selectPage = (pageId: string): void => {
    setActivePageId(pageId)
    setSelection(null)
    setDragState({ kind: 'idle' })
  }

  // Left/Right move between the section tabs (WAI-ARIA tabs pattern).
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = SECTIONS.findIndex((candidate) => candidate.id === section)
    const next = SECTIONS[(index + (event.key === 'ArrowRight' ? 1 : SECTIONS.length - 1)) % SECTIONS.length]
    setSection(next.id)
    document.getElementById(`${tabsId}-${next.id}`)?.focus()
  }

  return (
    <div className="dash-editor-panel">
      <div className="dash-editor-head">
        <button type="button" className="icon-button dash-editor-back" aria-label="Back to dashes" title="Back to dashes" onClick={requestClose}>
          <ArrowLeft size={16} />
        </button>
        <PageHeader title={draft.name || 'Untitled dash'}>
          <button type="button" className="button primary" disabled={!dirty || saving} onClick={() => void handleSave()}>
            <Save /> {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="button subtle" disabled={!dirty || saving} onClick={handleDiscard}>
            <Undo2 /> Discard
          </button>
          <CommandDivider />
          <label className="dash-editor-command-field">
            <span>Preview</span>
            <select
              value={previewState}
              onChange={(event) => {
                const match = dashPreviewStates.find((option) => option.state === event.target.value)
                if (match) setPreviewState(match.state)
              }}
            >
              {dashPreviewStates.map((option) => (
                <option key={option.state} value={option.state}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {section === 'widgets' && (
            <>
              <CommandDivider />
              <ViewControls zoom={zoom} onZoom={setZoom} showGrid={showGrid} onToggleGrid={() => setShowGrid((value) => !value)} />
            </>
          )}
          <CommandDivider />
          <button type="button" className="button subtle" onClick={() => setConfirmingReset(true)}>
            <RotateCcw /> Reset to preset
          </button>
        </PageHeader>
        {dirty && (
          <Status tone="warning" quiet role="status" className="dash-editor-unsaved">
            Unsaved changes
          </Status>
        )}
      </div>

      {saveError && (
        <div className="infobar error" role="alert">
          <span className="infobar-icon" aria-hidden="true">
            !
          </span>
          <span className="infobar-message">{saveError}</span>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setSaveError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Editor sections" onKeyDown={onTabKeyDown}>
        {SECTIONS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            id={`${tabsId}-${candidate.id}`}
            aria-selected={section === candidate.id}
            aria-controls={`${tabsId}-panel`}
            tabIndex={section === candidate.id ? 0 : -1}
            className="tab"
            onClick={() => setSection(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      <div className="dash-editor-section" role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${section}`}>
        {section === 'widgets' && (
          <div className="dash-editor-body">
            <div className="dash-editor-rail">
              <PagesCard draft={draft} activePageId={activePageId} onSelectPage={selectPage} apply={apply} />
              {activePage && (
                <WidgetCatalog
                  page={activePage}
                  isIdlePage={isIdlePage}
                  onAdd={(type) =>
                    apply((current) => {
                      const result = addWidget(current, activePageId, type)
                      if (result) setSelection({ location: { kind: 'page', pageId: activePageId }, widgetId: result.widget.id })
                      return result?.layout ?? null
                    })
                  }
                  onDrop={(type, col, row) =>
                    applyOrFlash((current) => {
                      const result = addWidgetAt(current, activePageId, type, col, row)
                      if (result) setSelection({ location: { kind: 'page', pageId: activePageId }, widgetId: result.widget.id })
                      return result?.layout ?? null
                    }, 'That cell is occupied — drop onto free space.')
                  }
                  canvasRef={canvasRef}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  cols={cols}
                  rows={rows}
                  zoom={zoom}
                  dragState={dragState}
                  setDragState={setDragState}
                />
              )}
              {activePage && (
                <WidgetStacksCard
                  page={activePage}
                  pageId={activePageId}
                  isIdlePage={isIdlePage}
                  apply={apply}
                  selection={selection}
                  onSelectWidget={(location, widgetId) => setSelection({ location, widgetId })}
                />
              )}
            </div>

            <section className="card dash-editor-stage" aria-label="Canvas">
              {flash && (
                <div className="infobar warning dash-editor-flash" role="status">
                  <span className="infobar-icon" aria-hidden="true">
                    !
                  </span>
                  <span className="infobar-message">{flash}</span>
                </div>
              )}
              <div className="dash-editor-well" ref={setWellElement}>
                {activePage ? (
                  <EditorCanvas
                    canvasRef={canvasRef}
                    draft={draft}
                    applyOrFlash={applyOrFlash}
                    activePage={activePage}
                    activePageId={activePageId}
                    isIdlePage={isIdlePage}
                    frame={previewFrame}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                    cols={cols}
                    rows={rows}
                    zoom={zoom}
                    showGrid={showGrid}
                    selection={selection}
                    onSelect={setSelection}
                    dragState={dragState}
                    setDragState={setDragState}
                  />
                ) : (
                  <p className="muted dash-editor-no-page">This dash has no pages yet.</p>
                )}
              </div>
            </section>

            <aside className="card dash-editor-properties" aria-label="Properties">
              {selectedWidget && selection ? (
                <WidgetInspector widget={selectedWidget} location={selection.location} apply={apply} onDeselect={() => setSelection(null)} />
              ) : (
                <DashProperties draft={draft} profile={profile} dirty={dirty} apply={apply} onScreenProfile={(profileId) => void send(buildDashSetScreenProfile(draft.id, profileId))} />
              )}
            </aside>
          </div>
        )}

        {section === 'alerts' && <AlertsEditor draft={draft} apply={apply} frame={previewFrame} activePageId={activePageId} isIdlePage={isIdlePage} canvasWidth={canvasWidth} canvasHeight={canvasHeight} />}

        {section === 'theme' && <ThemePanel draft={draft} profile={profile} apply={apply} frame={previewFrame} activePageId={activePageId} isIdlePage={isIdlePage} />}
      </div>

      {confirmingReset && (
        <ConfirmDialog
          title="Reset to preset?"
          message={`Every customization of ${draft.name} is discarded and the dash returns to its preset layout. This cannot be undone.`}
          confirmLabel="Reset"
          destructive
          onConfirm={() => void handleResetToDefaults()}
          onCancel={() => setConfirmingReset(false)}
        />
      )}

      {confirmingClose && (
        <ConfirmDialog
          title="Discard changes?"
          message={`Your unsaved edits to ${draft.name} will be lost.`}
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          destructive
          onConfirm={() => {
            setConfirmingClose(false)
            onClose()
          }}
          onCancel={() => setConfirmingClose(false)}
        />
      )}
    </div>
  )
}

// ── CommandBar: canvas view controls ─────────────────────────────────────

function ViewControls({ zoom, onZoom, showGrid, onToggleGrid }: { zoom: number; onZoom: (zoom: number) => void; showGrid: boolean; onToggleGrid: () => void }) {
  const index = ZOOM_LEVELS.indexOf(zoom)
  const from = index < 0 ? ZOOM_LEVELS.indexOf(1) : index
  const step = (delta: number): void => {
    onZoom(ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, from + delta))])
  }

  return (
    <>
      <button type="button" className="button subtle dash-editor-toggle" aria-pressed={showGrid} onClick={onToggleGrid}>
        <Grid2x2 /> Grid
      </button>
      <button type="button" className="icon-button" aria-label="Zoom out" title="Zoom out" disabled={from <= 0} onClick={() => step(-1)}>
        <ZoomOut size={14} />
      </button>
      <span className="dash-editor-zoom-value tabular" aria-label="Zoom">
        {Math.round(zoom * 100)}%
      </span>
      <button type="button" className="icon-button" aria-label="Zoom in" title="Zoom in" disabled={from >= ZOOM_LEVELS.length - 1} onClick={() => step(1)}>
        <ZoomIn size={14} />
      </button>
    </>
  )
}

// ── Editor canvas: direct manipulation, ghost, grid ──────────────────────

function GridOverlay({ cellW, cellH }: { cellW: number; cellH: number }) {
  return <div className="dash-editor-grid-overlay" style={{ backgroundSize: `${cellW}px ${cellH}px` }} />
}

function GhostRect({ rect, valid }: { rect: PixelRect; valid: boolean }) {
  return <div className={valid ? 'dash-editor-ghost is-valid' : 'dash-editor-ghost is-invalid'} style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} />
}

/** Position for one of a selected widget's 8 edge/corner resize handles, centered on that edge/corner. */
function handleStyle(handle: ResizeHandle): CSSProperties {
  const style: CSSProperties = { cursor: handleCursor(handle) }
  if (handle.hx < 0) style.left = -5
  else if (handle.hx > 0) style.right = -5
  else {
    style.left = '50%'
    style.marginLeft = -5
  }
  if (handle.hy < 0) style.top = -5
  else if (handle.hy > 0) style.bottom = -5
  else {
    style.top = '50%'
    style.marginTop = -5
  }
  return style
}

function WidgetOverlay({
  widget,
  rect,
  selected,
  onPointerDown,
  onResizeStart,
}: {
  widget: DashWidget
  rect: PixelRect
  selected: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onResizeStart: (handle: ResizeHandle, event: ReactPointerEvent<HTMLElement>) => void
}) {
  return (
    <div
      className={selected ? 'dash-editor-widget-overlay is-selected' : 'dash-editor-widget-overlay'}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      onPointerDown={onPointerDown}
    >
      {selected && <span className="dash-editor-widget-tag">{widgetDisplayName(widget.type)}</span>}
      {selected &&
        RESIZE_HANDLES.map((handle) => (
          <span
            key={`${handle.hx}:${handle.hy}`}
            className="dash-editor-resize-handle"
            style={handleStyle(handle)}
            onPointerDown={(event) => {
              event.stopPropagation()
              onResizeStart(handle, event)
            }}
          />
        ))}
    </div>
  )
}

/**
 * The widget grid: the read-only `DashRenderer` preview plus an interactive overlay — one
 * absolutely-positioned hit-target per page widget, pointer-aligned via the same `gridRect`
 * math `DashRenderer` uses internally so the overlay can never drift out of alignment with
 * what's actually rendered. Move/resize/delete here mutate through the same `DashesDomain`
 * mutators as the numeric inspector fields; this is a second input method, not a second model.
 */
function EditorCanvas({
  canvasRef,
  draft,
  applyOrFlash,
  activePage,
  activePageId,
  isIdlePage,
  frame,
  canvasWidth,
  canvasHeight,
  cols,
  rows,
  zoom,
  showGrid,
  selection,
  onSelect,
  dragState,
  setDragState,
}: {
  canvasRef: RefObject<HTMLDivElement | null>
  draft: DashLayout
  applyOrFlash: (mutate: (current: DashLayout) => DashLayout | null, failureMessage: string) => void
  activePage: DashPage
  activePageId: string
  isIdlePage: boolean
  frame: TelemetryFrame | null
  canvasWidth: number
  canvasHeight: number
  cols: number
  rows: number
  zoom: number
  showGrid: boolean
  selection: Selection | null
  onSelect: (selection: Selection | null) => void
  dragState: DragState
  setDragState: (state: DragState) => void
}) {
  const cellW = canvasWidth / cols
  const cellH = canvasHeight / rows

  const commitGeometry = (location: WidgetLocation, widgetId: string, rect: GridRect, failureMessage: string): void => {
    applyOrFlash(
      (current) =>
        location.kind === 'page'
          ? setWidgetGeometry(current, location.pageId, widgetId, rect)
          : setStackLayerWidgetGeometry(current, location.pageId, location.stackId, location.layerId, widgetId, rect),
      failureMessage,
    )
  }

  const beginMove = (widget: DashWidget, location: WidgetLocation, event: ReactPointerEvent<HTMLElement>): void => {
    if (!canvasRef.current) return
    onSelect({ location, widgetId: widget.id })
    // Take keyboard focus so Delete/Backspace can target the selection — the click landed on
    // a plain (non-focusable) overlay div, so focus never reaches the canvas on its own.
    canvasRef.current.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer = relativePointerPos(event, canvasRef.current, zoom)
    setDragState({ kind: 'moving', location, widgetId: widget.id, start: widget, pointerStart: pointer, pointer })
  }

  const beginResize = (widget: DashWidget, location: WidgetLocation, handle: ResizeHandle, event: ReactPointerEvent<HTMLElement>): void => {
    if (!canvasRef.current) return
    onSelect({ location, widgetId: widget.id })
    canvasRef.current.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer = relativePointerPos(event, canvasRef.current, zoom)
    setDragState({ kind: 'resizing', location, widgetId: widget.id, handle, start: widget, pointerStart: pointer, pointer })
  }

  const continueDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!canvasRef.current || (dragState.kind !== 'moving' && dragState.kind !== 'resizing')) return
    setDragState({ ...dragState, pointer: relativePointerPos(event, canvasRef.current, zoom) })
  }

  const endDrag = (): void => {
    if (dragState.kind === 'moving') {
      const deltaCol = Math.round((dragState.pointer.x - dragState.pointerStart.x) / cellW)
      const deltaRow = Math.round((dragState.pointer.y - dragState.pointerStart.y) / cellH)
      const rect = previewMoveRect(dragState.start, deltaCol, deltaRow, cols, rows)
      if (rect.col !== dragState.start.col || rect.row !== dragState.start.row) {
        commitGeometry(dragState.location, dragState.widgetId, rect, "Can't move there — it would overlap another widget.")
      }
    } else if (dragState.kind === 'resizing') {
      const deltaCol = Math.round((dragState.pointer.x - dragState.pointerStart.x) / cellW)
      const deltaRow = Math.round((dragState.pointer.y - dragState.pointerStart.y) / cellH)
      const rect = previewResizeRect(dragState.start, dragState.handle, deltaCol, deltaRow, cols, rows)
      if (rect.col !== dragState.start.col || rect.row !== dragState.start.row || rect.colSpan !== dragState.start.colSpan || rect.rowSpan !== dragState.start.rowSpan) {
        commitGeometry(dragState.location, dragState.widgetId, rect, "Can't resize there — it would overlap another widget.")
      }
    }

    if (dragState.kind !== 'idle') setDragState({ kind: 'idle' })
  }

  // Delete/Backspace removes the selected widget — never while typing in a field elsewhere in
  // the editor, since this handler only fires while the canvas itself holds focus.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!selection) return
    if (event.key === 'Delete' || event.key === 'Backspace') {
      applyOrFlash((current) => deleteWidgetAt(current, selection.location, selection.widgetId), 'That widget could not be deleted.')
      onSelect(null)
      event.preventDefault()
    }
  }

  let ghost: { rect: GridRect; valid: boolean } | null = null
  if (dragState.kind === 'moving' || dragState.kind === 'resizing') {
    const deltaCol = Math.round((dragState.pointer.x - dragState.pointerStart.x) / cellW)
    const deltaRow = Math.round((dragState.pointer.y - dragState.pointerStart.y) / cellH)
    const rect = dragState.kind === 'moving' ? previewMoveRect(dragState.start, deltaCol, deltaRow, cols, rows) : previewResizeRect(dragState.start, dragState.handle, deltaCol, deltaRow, cols, rows)
    ghost = { rect, valid: canPlaceWidgetAt(draft, dragState.location, dragState.widgetId, rect) }
  } else if (dragState.kind === 'placing' && dragState.pointer) {
    const colSpan = Math.min(DEFAULT_WIDGET_COL_SPAN, cols)
    const rowSpan = Math.min(DEFAULT_WIDGET_ROW_SPAN, rows)
    const rect: GridRect = {
      col: Math.max(0, Math.min(Math.floor(dragState.pointer.x / cellW), Math.max(0, cols - colSpan))),
      row: Math.max(0, Math.min(Math.floor(dragState.pointer.y / cellH), Math.max(0, rows - rowSpan))),
      colSpan,
      rowSpan,
    }
    ghost = { rect, valid: canPlaceNewWidget(draft, activePageId, rect) }
  }

  return (
    // The outer box reserves the zoomed layout footprint (a plain CSS `transform` never
    // affects layout size); the inner canvas stays at its true unscaled size so every pointer
    // computation below reads plain, un-zoomed grid coordinates via `getBoundingClientRect()`.
    <div className="dash-editor-canvas-zoom" style={{ width: canvasWidth * zoom, height: canvasHeight * zoom }}>
      <div
        ref={canvasRef}
        className="dash-editor-canvas"
        tabIndex={0}
        aria-label="Dash canvas. Delete removes the selected widget."
        style={{ width: canvasWidth, height: canvasHeight, transform: zoom === 1 ? undefined : `scale(${zoom})`, transformOrigin: 'top left' }}
        onKeyDown={onKeyDown}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onSelect(null)
        }}
      >
        <DashRenderer layout={draft} frame={frame} width={canvasWidth} height={canvasHeight} pageId={activePageId} idle={isIdlePage} />
        {showGrid && <GridOverlay cellW={cellW} cellH={cellH} />}
        {activePage.widgets.map((widget) => (
          <WidgetOverlay
            key={widget.id}
            widget={widget}
            rect={gridRect(canvasWidth, canvasHeight, cols, rows, widget)}
            selected={selection?.widgetId === widget.id}
            onPointerDown={(event) => beginMove(widget, { kind: 'page', pageId: activePageId }, event)}
            onResizeStart={(handle, event) => beginResize(widget, { kind: 'page', pageId: activePageId }, handle, event)}
          />
        ))}
        {ghost && <GhostRect rect={gridRect(canvasWidth, canvasHeight, cols, rows, ghost.rect)} valid={ghost.valid} />}
      </div>
    </div>
  )
}

// ── Pages ────────────────────────────────────────────────────────────────

function PagesCard({
  draft,
  activePageId,
  onSelectPage,
  apply,
}: {
  draft: DashLayout
  activePageId: string
  onSelectPage: (pageId: string) => void
  apply: Apply
}) {
  const activePage = findPage(draft, activePageId)
  const canDeleteActive = activePage !== null && activePage.id !== draft.idlePage?.id && draft.pages.length > 1
  const canClearActive = activePage !== null && (activePage.widgets.length > 0 || (activePage.widgetStacks ?? []).length > 0)
  const idlePage = draft.idlePage

  return (
    <section className="card dash-editor-card" aria-label="Pages">
      <div className="dash-editor-card-head">
        <h2 className="card-title">Pages</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Add page"
          title="Add page"
          onClick={() =>
            apply((current) => {
              const result = addPage(current, 'Page')
              onSelectPage(result.page.id)
              return result.layout
            })
          }
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="dash-editor-list">
        {idlePage && (
          <button type="button" className={activePageId === idlePage.id ? 'list-row selected' : 'list-row'} aria-pressed={activePageId === idlePage.id} onClick={() => onSelectPage(idlePage.id)}>
            <span className="dash-editor-row-label">{idlePage.name || 'Idle'}</span>
            <span className="muted">Idle</span>
          </button>
        )}
        {draft.pages.map((page) => (
          <button key={page.id} type="button" className={activePageId === page.id ? 'list-row selected' : 'list-row'} aria-pressed={activePageId === page.id} onClick={() => onSelectPage(page.id)}>
            <span className="dash-editor-row-label">{page.name}</span>
          </button>
        ))}
      </div>

      {activePage && (
        <label className="field">
          <span>Page name</span>
          <input
            key={`${activePage.id}:${activePage.name}`}
            defaultValue={activePage.name}
            onKeyDown={blurOnEnter}
            onBlur={(event) => apply((current) => renamePage(current, activePage.id, event.target.value))}
          />
        </label>
      )}

      <div className="dash-editor-card-actions">
        <button
          type="button"
          className="button small subtle"
          disabled={!canClearActive}
          title="Remove every widget and widget stack from this page"
          onClick={() =>
            apply((current) => {
              const result = clearPage(current, activePageId)
              if (result) onSelectPage(activePageId)
              return result
            })
          }
        >
          Clear page
        </button>
        <button
          type="button"
          className="button small subtle destructive"
          disabled={!canDeleteActive}
          title={canDeleteActive ? undefined : 'The idle page and the last remaining page cannot be deleted.'}
          onClick={() =>
            apply((current) => {
              const result = deletePage(current, activePageId)
              if (result) onSelectPage(result.pages[0]?.id ?? result.idlePage?.id ?? '')
              return result
            })
          }
        >
          <Trash2 /> Delete page
        </button>
        {idlePage ? (
          <button type="button" className="button small subtle" onClick={() => apply((current) => removeIdlePage(current))}>
            Remove idle page
          </button>
        ) : (
          <button
            type="button"
            className="button small subtle"
            onClick={() =>
              apply((current) => {
                const result = addIdlePage(current)
                if (result?.idlePage) onSelectPage(result.idlePage.id)
                return result
              })
            }
          >
            Add idle page
          </button>
        )}
      </div>
    </section>
  )
}

/** Commits a rename-on-blur text box with Enter. */
function blurOnEnter(event: ReactKeyboardEvent<HTMLInputElement>): void {
  if (event.key === 'Enter') event.currentTarget.blur()
}

// ── Widget catalogue ─────────────────────────────────────────────────────

/**
 * Catalogue rows are both click-to-add (old editor's fallback path, and the only way to reach
 * them by keyboard) and drag-to-place (old `OnPlaceMoved`/`OnPlaceReleased`): a pointer-down
 * captures the pointer on the row itself, tracks it against `canvasRef` regardless of where
 * it physically travels, and drops onto the grid cell under the pointer on release — or falls
 * back to auto-place if the pointer never entered the canvas, matching a plain click exactly.
 */
function WidgetCatalog({
  page,
  isIdlePage,
  onAdd,
  onDrop,
  canvasRef,
  canvasWidth,
  canvasHeight,
  cols,
  rows,
  zoom,
  dragState,
  setDragState,
}: {
  page: DashPage
  isIdlePage: boolean
  onAdd: (type: DashWidgetType) => void
  onDrop: (type: DashWidgetType, col: number, row: number) => void
  canvasRef: RefObject<HTMLDivElement | null>
  canvasWidth: number
  canvasHeight: number
  cols: number
  rows: number
  zoom: number
  dragState: DragState
  setDragState: (state: DragState) => void
}) {
  const types = ALL_WIDGET_TYPES.filter((type) => !isIdlePage || widgetDefinition(type)?.idleCapable)
  const cellW = canvasWidth / cols
  const cellH = canvasHeight / rows
  const isOverCanvas = (pointer: PointerPos): boolean => pointer.x >= 0 && pointer.y >= 0 && pointer.x <= canvasWidth && pointer.y <= canvasHeight

  const onPointerDown = (type: DashWidgetType, event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragState({ kind: 'placing', widgetType: type, pointer: null })
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (dragState.kind !== 'placing' || !canvasRef.current) return
    const pointer = relativePointerPos(event, canvasRef.current, zoom)
    setDragState({ ...dragState, pointer: isOverCanvas(pointer) ? pointer : null })
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (dragState.kind !== 'placing') return
    const { widgetType, pointer } = dragState
    setDragState({ kind: 'idle' })
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (pointer) {
      const col = Math.max(0, Math.min(Math.floor(pointer.x / cellW), Math.max(0, cols - DEFAULT_WIDGET_COL_SPAN)))
      const row = Math.max(0, Math.min(Math.floor(pointer.y / cellH), Math.max(0, rows - DEFAULT_WIDGET_ROW_SPAN)))
      onDrop(widgetType, col, row)
    } else {
      onAdd(widgetType)
    }
  }

  return (
    <section className="card dash-editor-card" aria-label="Widgets">
      <div className="dash-editor-card-head">
        <h2 className="card-title">Widgets</h2>
        <span className="muted tabular">{page.widgets.length} on this page</span>
      </div>
      {isIdlePage && <p className="field-hint">The idle page takes idle-capable widgets only.</p>}
      <div className="dash-editor-list dash-editor-catalog">
        {types.map((type) => (
          <button
            key={type}
            type="button"
            className="list-row dash-editor-catalog-item"
            title={`Drag onto the canvas, or click to place ${widgetDisplayName(type)}`}
            onPointerDown={(event) => onPointerDown(type, event)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            // Mouse activation is fully handled by the pointer sequence above; a keyboard
            // activation (Enter/Space) fires a `click` with `detail === 0`, which never
            // arrives from a mouse — this only runs the click-to-add fallback for keyboard.
            onClick={(event) => {
              if (event.detail === 0) onAdd(type)
            }}
          >
            <GripVertical size={14} className="dash-editor-grip" />
            <span className="dash-editor-row-label">{widgetDisplayName(type)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── Widget stacks ────────────────────────────────────────────────────────

function WidgetStacksCard({
  page,
  pageId,
  isIdlePage,
  apply,
  selection,
  onSelectWidget,
}: {
  page: DashPage
  pageId: string
  isIdlePage: boolean
  apply: Apply
  selection: Selection | null
  onSelectWidget: (location: WidgetLocation, widgetId: string) => void
}) {
  const stacks = page.widgetStacks ?? []
  return (
    <section className="card dash-editor-card" aria-label="Widget stacks">
      <div className="dash-editor-card-head">
        <h2 className="card-title">Widget stacks</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Add widget stack"
          title="Add widget stack"
          onClick={() =>
            apply((current) => {
              const result = addWidgetStack(current, pageId)
              return result?.layout ?? null
            })
          }
        >
          <Plus size={14} />
        </button>
      </div>
      {stacks.length === 0 ? (
        <p className="field-hint">A stack shows several small layouts in one region, one at a time.</p>
      ) : (
        stacks.map((stack) => (
          <StackEditor key={stack.id} stack={stack} pageId={pageId} isIdlePage={isIdlePage} apply={apply} selection={selection} onSelectWidget={onSelectWidget} />
        ))
      )}
    </section>
  )
}

function StackEditor({
  stack,
  pageId,
  isIdlePage,
  apply,
  selection,
  onSelectWidget,
}: {
  stack: DashWidgetStack
  pageId: string
  isIdlePage: boolean
  apply: Apply
  selection: Selection | null
  onSelectWidget: (location: WidgetLocation, widgetId: string) => void
}) {
  const activeLayerId = stack.defaultLayerId ?? stack.layers[0]?.id ?? ''
  const activeLayer = stack.layers.find((layer) => layer.id === activeLayerId) ?? stack.layers[0]
  const types = ALL_WIDGET_TYPES.filter((type) => !isIdlePage || widgetDefinition(type)?.idleCapable)
  const [addType, setAddType] = useState(types[0])

  return (
    <div className="dash-editor-stack">
      <label className="field">
        <span>Stack name</span>
        <input
          key={`${stack.id}:${stack.name}`}
          defaultValue={stack.name}
          onKeyDown={blurOnEnter}
          onBlur={(event) => apply((current) => renameWidgetStack(current, pageId, stack.id, event.target.value))}
        />
      </label>

      <GeometryFields rect={stack} onChange={(rect) => apply((current) => setWidgetStackGeometry(current, pageId, stack.id, rect))} />

      <div className="dash-editor-group">
        <span className="ui-label">Layers</span>
        <div className="dash-editor-list">
          {stack.layers.map((layer) => {
            const isDefault = layer.id === activeLayerId
            return (
              <div key={layer.id} className={isDefault ? 'list-row dash-editor-row selected' : 'list-row dash-editor-row'}>
                <button
                  type="button"
                  className="dash-editor-row-main"
                  aria-pressed={isDefault}
                  title="Show this layer by default"
                  onClick={() => apply((current) => setDefaultStackLayer(current, pageId, stack.id, layer.id))}
                >
                  <Layers size={14} />
                  <span className="dash-editor-row-label">{layer.name}</span>
                  {isDefault && <span className="muted">Default</span>}
                </button>
                <button
                  type="button"
                  className="icon-button dash-editor-row-action"
                  aria-label={`Delete ${layer.name}`}
                  title={`Delete ${layer.name}`}
                  disabled={stack.layers.length <= 1}
                  onClick={() => apply((current) => deleteStackLayer(current, pageId, stack.id, layer.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          className="button small subtle"
          onClick={() =>
            apply((current) => {
              const result = addStackLayer(current, pageId, stack.id)
              return result?.layout ?? null
            })
          }
        >
          <Plus /> Add layer
        </button>
      </div>

      {activeLayer && (
        <div className="dash-editor-group">
          <span className="ui-label">{activeLayer.name} widgets</span>
          {activeLayer.widgets.length === 0 ? (
            <p className="field-hint">No widgets in this layer yet.</p>
          ) : (
            <div className="dash-editor-list">
              {activeLayer.widgets.map((widget) => {
                const location: WidgetLocation = { kind: 'stackLayer', pageId, stackId: stack.id, layerId: activeLayer.id }
                const isSelected = selection?.widgetId === widget.id
                return (
                  <div key={widget.id} className={isSelected ? 'list-row dash-editor-row selected' : 'list-row dash-editor-row'}>
                    <button type="button" className="dash-editor-row-main" aria-pressed={isSelected} onClick={() => onSelectWidget(location, widget.id)}>
                      <span className="dash-editor-row-label">{widgetDisplayName(widget.type)}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button dash-editor-row-action"
                      aria-label={`Delete ${widgetDisplayName(widget.type)}`}
                      title={`Delete ${widgetDisplayName(widget.type)}`}
                      onClick={() => apply((current) => deleteWidgetAt(current, location, widget.id))}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <div className="dash-editor-inline">
            <select
              aria-label="Widget to add"
              value={addType}
              onChange={(event) => {
                const { value } = event.target
                if (isDashWidgetType(value)) setAddType(value)
              }}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {widgetDisplayName(type)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button"
              onClick={() =>
                apply((current) => {
                  const result = addWidgetToStackLayer(current, pageId, stack.id, activeLayer.id, addType)
                  return result?.layout ?? null
                })
              }
            >
              Add
            </button>
          </div>
        </div>
      )}

      <button type="button" className="button small subtle destructive" onClick={() => apply((current) => deleteWidgetStack(current, pageId, stack.id))}>
        <Trash2 /> Delete stack
      </button>
    </div>
  )
}

// ── Properties pane ──────────────────────────────────────────────────────

/** The properties pane with no widget selected: the dash's own name and screen size. */
function DashProperties({
  draft,
  profile,
  dirty,
  apply,
  onScreenProfile,
}: {
  draft: DashLayout
  profile: ScreenProfile
  dirty: boolean
  apply: Apply
  onScreenProfile: (profileId: string) => void
}) {
  return (
    <div className="dash-editor-pane">
      <div className="dash-editor-card-head">
        <h2 className="card-title">Dash</h2>
        {draft.default && (
          <span className="chip chip-default">
            <Star size={11} /> Default
          </span>
        )}
      </div>
      <label className="field">
        <span>Name</span>
        <input
          key={`${draft.id}:${draft.name}`}
          defaultValue={draft.name}
          onKeyDown={blurOnEnter}
          onBlur={(event) => apply((current) => renameLayout(current, event.target.value))}
        />
      </label>
      <label className="field">
        <span>Screen size</span>
        <select value={profile.id} disabled={dirty} onChange={(event) => onScreenProfile(event.target.value)}>
          {SCREEN_PROFILES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <span className="field-hint">{dirty ? 'Save or discard your edits before changing the screen size.' : `${profile.gridCols} × ${profile.gridRows} layout grid`}</span>
      </label>
      <p className="field-hint dash-editor-pane-hint">Select a widget on the canvas to edit its position, size and style. Drag a widget from the list onto the canvas to place it anywhere.</p>
    </div>
  )
}

function WidgetInspector({
  widget,
  location,
  apply,
  onDeselect,
}: {
  widget: DashWidget
  location: WidgetLocation
  apply: Apply
  onDeselect: () => void
}) {
  const definition = widgetDefinition(widget.type)
  const config = widget.config ?? {}

  const setGeometry = (rect: GridRect): void => {
    apply((current) =>
      location.kind === 'page'
        ? setWidgetGeometry(current, location.pageId, widget.id, rect)
        : setStackLayerWidgetGeometry(current, location.pageId, location.stackId, location.layerId, widget.id, rect),
    )
  }

  return (
    <div className="dash-editor-pane">
      <div className="dash-editor-card-head">
        <h2 className="card-title">{widgetDisplayName(widget.type)}</h2>
        <button type="button" className="icon-button" aria-label="Deselect widget" title="Deselect" onClick={onDeselect}>
          <X size={14} />
        </button>
      </div>

      <div className="dash-editor-group">
        <h3 className="eyebrow">Position &amp; size</h3>
        <GeometryFields rect={widget} onChange={setGeometry} />
      </div>

      {definition && definition.config.length > 0 && (
        <div className="dash-editor-group">
          <h3 className="eyebrow">Properties</h3>
          {definition.config.map((field) => {
            const raw = config[field.key]
            const value = typeof raw === 'string' ? raw : field.default
            if (field.kind === 'select') {
              return (
                <label className="field" key={field.key}>
                  <span>{field.label}</span>
                  <select value={value} onChange={(event) => apply((current) => setWidgetConfig(current, location, widget.id, field.key, event.target.value))}>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )
            }

            return <TextConfigField key={field.key} label={field.label} value={value} onCommit={(next) => apply((current) => setWidgetConfig(current, location, widget.id, field.key, next))} />
          })}
        </div>
      )}

      <div className="dash-editor-group">
        <h3 className="eyebrow">Style</h3>
        <label className="field">
          <span>Value color</span>
          <select value={widget.style?.textColor ?? ''} onChange={(event) => apply((current) => setWidgetStyle(current, location, widget.id, { textColor: event.target.value || undefined }))}>
            <option value="">Inherit</option>
            {WIDGET_STYLE_COLOR_TOKENS.map((token) => (
              <option key={token.value} value={token.value}>
                {token.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Label color</span>
          <select value={widget.style?.labelColor ?? ''} onChange={(event) => apply((current) => setWidgetStyle(current, location, widget.id, { labelColor: event.target.value || undefined }))}>
            <option value="">Inherit</option>
            {WIDGET_STYLE_COLOR_TOKENS.map((token) => (
              <option key={token.value} value={token.value}>
                {token.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Border</span>
          <select
            value={widget.style?.border === undefined ? 'default' : widget.style.border ? 'on' : 'off'}
            onChange={(event) => {
              const next = event.target.value
              apply((current) => setWidgetStyle(current, location, widget.id, { border: next === 'default' ? undefined : next === 'on' }))
            }}
          >
            <option value="default">Default</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>
      </div>

      <button
        type="button"
        className="button small destructive"
        onClick={() => {
          apply((current) => deleteWidgetAt(current, location, widget.id))
          onDeselect()
        }}
      >
        <Trash2 /> Delete widget
      </button>
    </div>
  )
}

function TextConfigField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <label className="field">
      <span>{label}</span>
      <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={blurOnEnter} onBlur={() => onCommit(text)} />
    </label>
  )
}

// ── Number boxes (geometry, durations) ───────────────────────────────────

/** Fluent NumberBox with inline spin buttons; the value itself is read-only. */
function NumberBox({
  label,
  display,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
}: {
  label: string
  display: string
  canDecrease: boolean
  canIncrease: boolean
  onDecrease: () => void
  onIncrease: () => void
}) {
  return (
    <div className="dash-editor-numberbox" role="group" aria-label={label}>
      <span className="dash-editor-numberbox-value tabular">{display}</span>
      <button type="button" className="dash-editor-spin" aria-label={`Decrease ${label}`} disabled={!canDecrease} onClick={onDecrease}>
        <Minus size={12} />
      </button>
      <button type="button" className="dash-editor-spin" aria-label={`Increase ${label}`} disabled={!canIncrease} onClick={onIncrease}>
        <Plus size={12} />
      </button>
    </div>
  )
}

function GeometryFields({ rect, onChange }: { rect: GridRect; onChange: (rect: GridRect) => void }) {
  return (
    <div className="dash-editor-geometry">
      <GeometryStepper label="Column" value={rect.col} onChange={(col) => onChange({ ...rect, col })} />
      <GeometryStepper label="Row" value={rect.row} onChange={(row) => onChange({ ...rect, row })} />
      <GeometryStepper label="Width" value={rect.colSpan} min={1} onChange={(colSpan) => onChange({ ...rect, colSpan })} />
      <GeometryStepper label="Height" value={rect.rowSpan} min={1} onChange={(rowSpan) => onChange({ ...rect, rowSpan })} />
    </div>
  )
}

function GeometryStepper({ label, value, min = 0, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <NumberBox label={label} display={String(value)} canDecrease={value > min} canIncrease onDecrease={() => onChange(Math.max(min, value - 1))} onIncrease={() => onChange(value + 1)} />
    </div>
  )
}

/** Alert durations are 0.5-5.0s in 0.1s steps (DashEditorController.SetAlertDuration's clamp/round). Steps in tenths internally so +/- never drifts on floating-point seconds. */
function DurationStepper({ seconds, onChange }: { seconds: number; onChange: (seconds: number) => void }) {
  const tenths = Math.round(seconds * 10)
  return (
    <div className="field">
      <span>Duration</span>
      <NumberBox
        label="Duration"
        display={`${(tenths / 10).toFixed(1)} s`}
        canDecrease={tenths > 5}
        canIncrease={tenths < 50}
        onDecrease={() => onChange(Math.max(5, tenths - 1) / 10)}
        onIncrease={() => onChange(Math.min(50, tenths + 1) / 10)}
      />
    </div>
  )
}

// ── Alerts ───────────────────────────────────────────────────────────────

/**
 * A dimmed dash preview with the alert's own draggable, resizable geometry drawn over it —
 * mirrors the old editor's `BuildAlertCanvas`/`BeginAlertDrag`. Only the bottom-right handle
 * resizes (alerts don't get the widget canvas's full 8-handle set); arrow keys move and
 * Shift+arrow keys resize, matching `OnAlertWidgetKeyDown` exactly.
 */
function AlertCanvas({
  draft,
  alert,
  frame,
  pageId,
  isIdlePage,
  canvasWidth,
  canvasHeight,
  onChange,
}: {
  draft: DashLayout
  alert: GridRect
  frame: TelemetryFrame | null
  pageId: string
  isIdlePage: boolean
  canvasWidth: number
  canvasHeight: number
  onChange: (rect: GridRect) => void
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ mode: 'move' | 'resize'; start: GridRect; pointerStart: PointerPos; pointer: PointerPos } | null>(null)
  const cols = draft.gridCols > 0 ? draft.gridCols : 20
  const rows = draft.gridRows > 0 ? draft.gridRows : 12
  const cellW = canvasWidth / cols
  const cellH = canvasHeight / rows

  const dragRect = (state: { mode: 'move' | 'resize'; start: GridRect; pointerStart: PointerPos; pointer: PointerPos }): GridRect => {
    const deltaCol = Math.round((state.pointer.x - state.pointerStart.x) / cellW)
    const deltaRow = Math.round((state.pointer.y - state.pointerStart.y) / cellH)
    return state.mode === 'move' ? previewMoveRect(state.start, deltaCol, deltaRow, cols, rows) : previewResizeRect(state.start, { hx: 1, hy: 1 }, deltaCol, deltaRow, cols, rows)
  }

  const currentRect = drag ? dragRect(drag) : alert

  const beginDrag = (mode: 'move' | 'resize', event: ReactPointerEvent<HTMLElement>): void => {
    if (!canvasRef.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const pointer = relativePointerPos(event, canvasRef.current, 1)
    setDrag({ mode, start: alert, pointerStart: pointer, pointer })
    event.stopPropagation()
  }

  const continueDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drag || !canvasRef.current) return
    setDrag({ ...drag, pointer: relativePointerPos(event, canvasRef.current, 1) })
  }

  const endDrag = (): void => {
    if (drag) onChange(dragRect(drag))
    setDrag(null)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const deltaCol = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    const deltaRow = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (deltaCol === 0 && deltaRow === 0) return
    event.preventDefault()
    onChange(
      event.shiftKey
        ? { ...alert, colSpan: alert.colSpan + deltaCol, rowSpan: alert.rowSpan + deltaRow }
        : { ...alert, col: alert.col + deltaCol, row: alert.row + deltaRow },
    )
  }

  const rect = gridRect(canvasWidth, canvasHeight, cols, rows, currentRect)

  return (
    <div ref={canvasRef} className="dash-editor-alert-canvas" style={{ width: canvasWidth, height: canvasHeight }} onPointerMove={continueDrag} onPointerUp={endDrag}>
      <DashRenderer layout={draft} frame={frame} width={canvasWidth} height={canvasHeight} pageId={pageId} idle={isIdlePage} className="dash-editor-alert-canvas-backdrop" />
      <div className="dash-editor-alert-canvas-dim" />
      <div
        className="dash-editor-alert-widget"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        tabIndex={0}
        role="group"
        aria-label="Alert position and size"
        title="Drag to move; drag the corner to resize. Arrow keys move; Shift+arrow keys resize."
        onPointerDown={(event) => beginDrag('move', event)}
        onKeyDown={onKeyDown}
      >
        <span className="dash-editor-alert-widget-resize" onPointerDown={(event) => beginDrag('resize', event)} />
      </div>
    </div>
  )
}

/** Alerts tab: the global defaults on top, then a master/detail of the alert types. */
function AlertsEditor({
  draft,
  apply,
  frame,
  activePageId,
  isIdlePage,
  canvasWidth,
  canvasHeight,
}: {
  draft: DashLayout
  apply: Apply
  frame: TelemetryFrame | null
  activePageId: string
  isIdlePage: boolean
  canvasWidth: number
  canvasHeight: number
}) {
  const global = globalAlertConfig(draft)
  const [selectedType, setSelectedType] = useState<AlertTypeId | null>(ALERT_TYPES[0]?.type ?? null)
  const selected = ALERT_TYPES.find((candidate) => candidate.type === selectedType) ?? null

  return (
    <div className="dash-editor-alerts">
      <section className="card dash-editor-card" aria-label="Alert defaults">
        <div className="dash-editor-card-head">
          <h2 className="card-title">Alert defaults</h2>
        </div>
        <p className="field-hint">Alerts use these unless they set their own color, duration and inversion.</p>
        <div className="dash-editor-field-row">
          <label className="field">
            <span>Display</span>
            <select value={global.displayMode} onChange={(event) => apply((current) => setGlobalAlertConfig(current, { displayMode: event.target.value === 'center' ? 'center' : 'full' }))}>
              <option value="full">Full width</option>
              <option value="center">Centered</option>
            </select>
          </label>
          <label className="field">
            <span>Color</span>
            <select value={global.colorToken} onChange={(event) => apply((current) => setGlobalAlertConfig(current, { colorToken: event.target.value }))}>
              {ALERT_COLOR_TOKENS.map((token) => (
                <option key={token.value} value={token.value}>
                  {token.label}
                </option>
              ))}
            </select>
          </label>
          <DurationStepper seconds={global.durationSeconds} onChange={(durationSeconds) => apply((current) => setGlobalAlertConfig(current, { durationSeconds }))} />
          <label className="dash-editor-check">
            <input type="checkbox" checked={global.invertColors} onChange={(event) => apply((current) => setGlobalAlertConfig(current, { invertColors: event.target.checked }))} />
            Invert colors
          </label>
        </div>
      </section>

      <div className="dash-editor-alerts-body">
        <section className="card dash-editor-card" aria-label="Alerts">
          <div className="dash-editor-card-head">
            <h2 className="card-title">Alerts</h2>
          </div>
          <div className="dash-editor-list">
            {ALERT_TYPES.map(({ type, label }) => {
              const enabled = findAlert(draft, type)?.enabled ?? false
              return (
                <button key={type} type="button" className={type === selectedType ? 'list-row selected' : 'list-row'} aria-pressed={type === selectedType} onClick={() => setSelectedType(type)}>
                  <span className="dash-editor-row-label">{label}</span>
                  <Status tone={enabled ? 'success' : 'neutral'} quiet>
                    {enabled ? 'On' : 'Off'}
                  </Status>
                </button>
              )
            })}
          </div>
        </section>

        {selected && (
          <AlertDetail
            key={selected.type}
            draft={draft}
            type={selected.type}
            label={selected.label}
            apply={apply}
            frame={frame}
            activePageId={activePageId}
            isIdlePage={isIdlePage}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
          />
        )}
      </div>
    </div>
  )
}

function AlertDetail({
  draft,
  type,
  label,
  apply,
  frame,
  activePageId,
  isIdlePage,
  canvasWidth,
  canvasHeight,
}: {
  draft: DashLayout
  type: AlertTypeId
  label: string
  apply: Apply
  frame: TelemetryFrame | null
  activePageId: string
  isIdlePage: boolean
  canvasWidth: number
  canvasHeight: number
}) {
  const alert = findAlert(draft, type)
  const enabled = alert?.enabled ?? false
  const usesGlobal = alert ? alert.colorToken === undefined && alert.durationSeconds === undefined && alert.invertColors === undefined : true
  const onGeometryChange = (rect: GridRect): void => apply((current) => setAlertGeometry(current, type, rect))

  return (
    <section className="card dash-editor-card dash-editor-alert-detail" aria-label={label}>
      <div className="dash-editor-card-head">
        <h2 className="card-title">{label}</h2>
      </div>
      <label className="dash-editor-check">
        <input type="checkbox" checked={enabled} onChange={(event) => apply((current) => setAlertEnabled(current, type, event.target.checked))} />
        Show on the dash
      </label>

      {enabled && alert ? (
        <>
          <div className="dash-editor-alert-well">
            <AlertCanvas draft={draft} alert={alert} frame={frame} pageId={activePageId} isIdlePage={isIdlePage} canvasWidth={canvasWidth} canvasHeight={canvasHeight} onChange={onGeometryChange} />
          </div>
          <GeometryFields rect={alert} onChange={onGeometryChange} />

          <label className="dash-editor-check">
            <input type="checkbox" checked={!usesGlobal} onChange={(event) => apply((current) => setAlertUseGlobal(current, type, !event.target.checked))} />
            Use its own color, duration and inversion
          </label>

          {!usesGlobal && (
            <div className="dash-editor-field-row">
              <label className="field">
                <span>Color</span>
                <select value={alert.colorToken ?? 'auto'} onChange={(event) => apply((current) => setAlertOverride(current, type, { colorToken: event.target.value }))}>
                  {ALERT_COLOR_TOKENS.map((token) => (
                    <option key={token.value} value={token.value}>
                      {token.label}
                    </option>
                  ))}
                </select>
              </label>
              <DurationStepper seconds={alert.durationSeconds ?? 1.5} onChange={(durationSeconds) => apply((current) => setAlertOverride(current, type, { durationSeconds }))} />
              <label className="dash-editor-check">
                <input type="checkbox" checked={alert.invertColors ?? false} onChange={(event) => apply((current) => setAlertOverride(current, type, { invertColors: event.target.checked }))} />
                Invert colors
              </label>
            </div>
          )}
        </>
      ) : (
        <p className="field-hint">Turn the alert on to place it on the dash and set its look.</p>
      )}
    </section>
  )
}

// ── Theme presets ────────────────────────────────────────────────────────

/**
 * Complete visual-direction presets, each rendered with the real `DashRenderer` against the
 * dash's own current page — a true preview, not a static swatch — mirrors the old editor's
 * `BuildThemePanel`/`ThemePresetCard`.
 */
function ThemePanel({
  draft,
  profile,
  apply,
  frame,
  activePageId,
  isIdlePage,
}: {
  draft: DashLayout
  profile: ScreenProfile
  apply: Apply
  frame: TelemetryFrame | null
  activePageId: string
  isIdlePage: boolean
}) {
  const activePresetName = matchLayoutThemeName(draft)
  const preview = fitScreenSize(profile, THEME_PREVIEW_MAX_WIDTH, THEME_PREVIEW_MAX_HEIGHT)

  return (
    <section className="card dash-editor-card" aria-label="Theme presets">
      <div className="dash-editor-card-head">
        <h2 className="card-title">Theme presets</h2>
      </div>
      <p className="field-hint">Choose a complete visual direction. Graphite keeps the functional racing colors; the other presets apply their own accent.</p>
      <div className="dash-editor-theme-grid">
        {dashThemePresets.map((preset) => {
          const selected = preset.name === activePresetName
          const colorSystem = preset.name === 'Graphite' ? 'functional' : 'styled'
          const previewLayout: DashLayout = { ...draft, theme: preset.theme, colorSystem }
          return (
            <button
              key={preset.name}
              type="button"
              className={selected ? 'dash-editor-theme-item selected' : 'dash-editor-theme-item'}
              aria-pressed={selected}
              onClick={() => apply((current) => applyThemePreset(current, preset.theme, colorSystem))}
            >
              <span className="dash-editor-theme-preview">
                <DashRenderer layout={previewLayout} frame={frame} width={preview.width} height={preview.height} pageId={activePageId} idle={isIdlePage} />
              </span>
              <span className="dash-editor-theme-label">
                <span className="dash-editor-theme-swatch" style={{ background: presetSwatchColor(preset) }} />
                <span className="dash-editor-row-label">{preset.name}</span>
                {selected && <Check size={14} className="dash-editor-theme-check" aria-label="Selected" />}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
