import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Bell, Trash2 } from 'lucide-react'
import { DashCanvas, pageGear, pitLimiterStyle, previewFrame } from '@sprint/dashboard'
import type { DashLayout, DashPitLimiterStyle } from '@sprint/dashboard'
import { LayoutSection } from './LayoutSection'
import type { ModeActions } from './PageInspector'
import { WidgetLibrary } from './WidgetLibrary'
import type { DragState } from './DesignerCanvas'
import { PIT_LIMITER_PAGE_ID, clearPitLimiterWidgets, coveredSpots, hasPitLimiterWidgets, onPitLimiter, pitLimiterView, setPitLimiterStyle } from './pitLimiterOps'
import { BEZEL, useStageCanvas } from './useStageCanvas'
import type { DesignerDocApi } from './useDesignerDoc'

const STYLES: ReadonlyArray<{ value: DashPitLimiterStyle; label: string; text: string }> = [
  { value: 'gear', label: 'Gear', text: 'Only the gear turns yellow, PIT LIMITER under it. You add widgets.' },
  { value: 'box', label: 'Box', text: 'A yellow frame round the sides and the top, PIT LIMITER across it. You add widgets.' },
  { value: 'full', label: 'Full screen', text: 'All yellow: gear, speed and PIT LIMITER. Nothing to add.' },
]

// The stage shows the dash on the pit lane, its limiter on.
const PIT_FRAME = previewFrame('pit')

/**
 * The Pit limiter section: what this dash shows over its page while the pit limiter is on. The
 * three looks are picked above the stage; with the gear or the box the driver drops widgets of the
 * overlay's own on an empty copy of the grid, with the Layout section's tools (`LayoutSection`
 * with an overlay, over `pitLimiterView`). The stage shows the page chosen in Layout faded back and
 * the overlay at full strength over it. Turning it on or off is app-wide, on Dashes > Settings.
 */
export function PitLimiterSection({
  doc,
  pageId,
  modes,
  onOpenDashSettings,
}: {
  doc: DesignerDocApi
  /** The page the overlay is shown over (the one chosen in the Layout section). */
  pageId: string
  modes: ModeActions
  onOpenDashSettings: () => void
}) {
  const { layout, apply } = doc
  const style = pitLimiterStyle(layout)
  // Never over the idle page: the overlay shows while driving.
  const under = layout.pages.find((page) => page.id === pageId) ?? layout.pages[0]
  const underId = under?.id ?? ''
  const gear = under ? pageGear(under) : null
  const view = useMemo(() => pitLimiterView(layout, gear), [layout, gear])
  const viewDoc: DesignerDocApi = { ...doc, layout: view, apply: (mutate, group) => apply(onPitLimiter(mutate, gear), group) }

  const backdrop = (width: number, height: number) => <PitBackdrop layout={layout} pageId={underId} width={width} height={height} />
  const choices = <StyleChoices style={style} tracked={layout.colSizes !== undefined} onStyle={(next) => apply((current) => setPitLimiterStyle(current, next))} />
  const panel = <PitPanel layout={layout} onClear={() => apply(clearPitLimiterWidgets)} onOpenDashSettings={onOpenDashSettings} />

  if (style === 'full') return <FullScreenStage layout={layout} backdrop={backdrop} aboveStage={choices} panel={panel} />
  return (
    <LayoutSection
      doc={viewDoc}
      frame={PIT_FRAME}
      chosenPageId={PIT_LIMITER_PAGE_ID}
      onChoosePage={() => undefined}
      modes={modes}
      view="preview"
      previewState="pit"
      showGrid={false}
      overlay={{ backdrop, aboveStage: choices, panel, covered: coveredSpots(layout, gear) }}
    />
  )
}

/** The stage's picture: the page under the overlay faded back (it is not edited here), the overlay alone over it. */
function PitBackdrop({ layout, pageId, width, height }: { layout: DashLayout; pageId: string; width: number; height: number }) {
  // The page's own alerts must not draw the overlay a second time, unfaded.
  const page: DashLayout = { ...layout, alerts: [] }
  return (
    <span className="designer-pit-backdrop" style={{ width, height }}>
      <DashCanvas layout={page} frame={PIT_FRAME} width={width} height={height} pageId={pageId} className="designer-pit-under" />
      <span className="designer-pit-over">
        <DashCanvas layout={layout} frame={PIT_FRAME} width={width} height={height} pageId={pageId} pitLimiterOnly />
      </span>
    </span>
  )
}

/** The full screen has nothing to add: the library is out of reach and the stage only shows. */
function FullScreenStage({ layout, backdrop, aboveStage, panel }: { layout: DashLayout; backdrop: (width: number, height: number) => ReactNode; aboveStage: ReactNode; panel: ReactNode }) {
  const { setFitElement, canvas } = useStageCanvas(layout)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [dragState, setDragState] = useState<DragState>({ kind: 'idle' })
  return (
    <>
      <WidgetLibrary
        isIdlePage={false}
        canvasRef={canvasRef}
        canvasWidth={0}
        canvasHeight={0}
        dragState={dragState}
        setDragState={setDragState}
        onAdd={() => undefined}
        onDrop={() => undefined}
        off={layout.colSizes ? 'The full screen shows the gear and the speed; there is nothing to add.' : 'This dash has an even grid, so it shows the full screen; there is nothing to add.'}
      />
      <div className="designer-fit is-stacked">
        {aboveStage}
        <div ref={setFitElement} className="designer-fit-box">
          {canvas && (
            <div className="designer-bezel" style={{ padding: BEZEL }}>
              <div ref={canvasRef} className="designer-canvas" style={{ width: canvas.width, height: canvas.height }}>
                {backdrop(canvas.width, canvas.height)}
              </div>
            </div>
          )}
        </div>
      </div>
      {panel}
    </>
  )
}

/** The three looks, each a tiny wheel with its name and what it does. An even-grid dash (an older one) shows only the full screen. */
function StyleChoices({ style, tracked, onStyle }: { style: DashPitLimiterStyle; tracked: boolean; onStyle: (style: DashPitLimiterStyle) => void }) {
  return (
    <div className="designer-pit-styles" role="radiogroup" aria-label="How the pit limiter looks">
      {STYLES.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === style}
          disabled={!tracked && option.value !== 'full'}
          className="designer-choice is-row"
          onClick={() => onStyle(option.value)}
        >
          <StyleThumb style={option.value} />
          <span className="designer-choice-text">
            <span className="designer-choice-name">{option.label}</span>
            <span className="designer-choice-hint">{option.text}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

/** A look as a tiny wheel: the dash in outline, the part the look turns yellow filled in. */
function StyleThumb({ style }: { style: DashPitLimiterStyle }) {
  const zone = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx={1} className="designer-thumb-zone" />
  return (
    <svg className="designer-thumb" viewBox="0 0 64 40" aria-hidden="true">
      <rect x={0.5} y={0.5} width={63} height={39} rx={5} className={style === 'full' ? 'designer-thumb-face is-lit' : 'designer-thumb-face'} />
      {style === 'box' && <path d="M5.5 0.5h53a5 5 0 0 1 5 5v34h-5.5v-32h-52v32h-5.5v-34a5 5 0 0 1 5-5z" className="designer-thumb-lit" />}
      {style !== 'full' && (
        <>
          {zone(7, 8, 18, 27)}
          {zone(39, 8, 18, 27)}
          {style === 'gear' ? <rect x={27} y={8} width={10} height={12} rx={1} className="designer-thumb-lit" /> : zone(27, 8, 10, 12)}
          {zone(27, 22, 10, 13)}
        </>
      )}
      {style === 'full' && <rect x={27} y={11} width={10} height={18} rx={1.5} className="designer-thumb-ink" />}
    </svg>
  )
}

/** The section's panel while nothing is selected: what the overlay is, where it is turned on, and clearing its widgets. */
function PitPanel({ layout, onClear, onOpenDashSettings }: { layout: DashLayout; onClear: () => void; onOpenDashSettings: () => void }) {
  const style = pitLimiterStyle(layout)
  return (
    <aside className="designer-pane designer-inspector" aria-label="Pit limiter">
      <div className="designer-panel-head">
        <h2 className="designer-panel-title">Pit limiter</h2>
      </div>
      <p className="field-hint">Shown over the dash while the pit limiter is on. Spots you leave empty show the dash underneath.</p>
      <div className="designer-group">
        <h3 className="designer-group-title">On every dash</h3>
        <p className="field-hint">Turning it on or off is set for every dash on the Dashes page.</p>
        <button type="button" className="button small" onClick={onOpenDashSettings}>
          <Bell size={14} /> Open alerts
        </button>
      </div>
      <button type="button" className="button subtle designer-review-reset" disabled={style === 'full' || !hasPitLimiterWidgets(layout)} onClick={onClear}>
        <Trash2 size={14} /> Remove all widgets
      </button>
    </aside>
  )
}
