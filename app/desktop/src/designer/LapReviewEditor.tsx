import { useState } from 'react'
import { Bell, Check, RotateCcw } from 'lucide-react'
import { LAP_REVIEW_TOP_SHARE, dashAlertDefaults, dashAlertFromSettings, dashLapReviewFields, lapReviewCells, previewAlertBanner, resolveDashPalette } from '@sprint/dashboard'
import type { DashLapReviewField, DashLayout } from '@sprint/dashboard'
import type { TelemetryFrame } from '@sprint/types'
import { layoutScreenProfile } from '../views/DashesDomain'
import { ScaledDash } from '../views/ScaledDash'
import { hasOwnLapReview, resetLapReview, setLapReviewCell } from './layoutOps'
import { BEZEL } from './useStageCanvas'
import type { Mutate } from './useDesignerDoc'

/** The fields in the library's sections; `none` stands apart at the end. */
const SECTIONS: readonly { title: string; ids: readonly DashLapReviewField[] }[] = [
  { title: 'Timing', ids: ['sector1', 'sector2', 'sector3', 'target', 'best_lap'] },
  { title: 'Race', ids: ['position', 'lap', 'gap_ahead'] },
  { title: 'Car', ids: ['fuel_used', 'fuel_left', 'energy_used', 'tyre_wear'] },
  { title: '', ids: ['none'] },
]
const ROWS = ['middle row', 'bottom row']
const COLUMNS = ['left', 'centre', 'right']
const boxName = (index: number): string => `${ROWS[Math.floor(index / 3)]}, ${COLUMNS[index % 3]}`
const labelOf = (id: DashLapReviewField): string => dashLapReviewFields.find((field) => field.id === id)?.label ?? id

// The lap review as the wheel shows it: its own made-up lap, held on the stage.
const LAP_ALERT = dashAlertFromSettings(dashAlertDefaults.find((alert) => alert.type === 'lap_summary') ?? dashAlertDefaults[0])

/**
 * The page dock's Lap review stop in the Layout section: this dash's lap review on the stage, held,
 * with a box over each of its six cells. Picking a box, then a field in the library on the left,
 * puts that field there; the right panel explains the fixed top row, points to Dashes > Settings
 * (where every dash's lap review is turned on and timed) and resets the boxes.
 */
export function LapReviewEditor({
  layout,
  apply,
  frame,
  canvas,
  setFitElement,
  onOpenDashSettings,
}: {
  layout: DashLayout
  apply: (mutate: Mutate) => boolean
  frame: TelemetryFrame | null
  /** The dash's size on the stage (`useStageCanvas`). */
  canvas: { width: number; height: number } | null
  setFitElement: (element: HTMLDivElement | null) => void
  onOpenDashSettings: () => void
}) {
  const [box, setBox] = useState(0)
  const cells = lapReviewCells(layout.lapReview)
  const shown = cells[box] ?? 'none'
  const profile = layoutScreenProfile(layout)
  const banner = previewAlertBanner(layout, LAP_ALERT, resolveDashPalette(layout.theme, layout.colorSystem))

  return (
    <>
      <aside className="designer-glass designer-sidebar designer-library designer-review-library" aria-label="Lap review fields">
        <div className="designer-sidebar-head">
          <span className="designer-sidebar-page">{`Show in ${boxName(box)}`}</span>
        </div>
        <div className="designer-sidebar-body">
          {SECTIONS.map((section) => (
            <section key={section.title || 'empty'} className="designer-library-section" aria-label={section.title || 'Empty'}>
              {section.title ? <h3 className="designer-library-head">{section.title}</h3> : <span className="designer-review-sep" aria-hidden="true" />}
              {section.ids.map((id) => {
                const on = shown === id
                return (
                  <button key={id} type="button" className={on ? 'designer-library-item on' : 'designer-library-item'} aria-pressed={on} onClick={() => apply((current) => setLapReviewCell(current, box, id))}>
                    <span className="designer-row-label">{labelOf(id)}</span>
                    {on && <Check size={14} className="designer-review-check" aria-hidden="true" />}
                  </button>
                )
              })}
            </section>
          ))}
        </div>
        <p className="field-hint designer-sidebar-foot">Pick a box on the lap review, then what it shows.</p>
      </aside>

      <div ref={setFitElement} className="designer-fit">
        {canvas && (
          <div className="designer-bezel" style={{ padding: BEZEL }}>
            <span className="designer-review">
              <ScaledDash layout={layout} size={profile} maxWidth={canvas.width} maxHeight={canvas.height} frame={frame} pageId={layout.pages[0]?.id} banner={banner} />
              <span className="designer-review-boxes" role="group" aria-label="Lap review boxes">
                {cells.map((cell, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={index === box}
                    aria-label={`${boxName(index)}: ${labelOf(cell)}`}
                    className="designer-review-box"
                    style={{
                      left: `${((index % 3) * 100) / 3}%`,
                      top: `${(LAP_REVIEW_TOP_SHARE + (Math.floor(index / 3) * (1 - LAP_REVIEW_TOP_SHARE)) / 2) * 100}%`,
                      width: `${100 / 3}%`,
                      height: `${((1 - LAP_REVIEW_TOP_SHARE) / 2) * 100}%`,
                    }}
                    onClick={() => setBox(index)}
                  />
                ))}
              </span>
            </span>
          </div>
        )}
      </div>

      <aside className="designer-glass designer-inspector" aria-label="Lap review">
        <div className="designer-panel-head">
          <h2 className="designer-panel-title">Lap review</h2>
        </div>
        <p className="field-hint">Shown after each timed lap. The top row always shows the lap time and the gap to your best lap; you pick the six boxes under it.</p>
        <div className="designer-group">
          <h3 className="designer-group-title">On every dash</h3>
          <p className="field-hint">Turning it on or off and how long it stays up are set for every dash on the Dashes page.</p>
          <button type="button" className="button small" onClick={onOpenDashSettings}>
            <Bell size={14} /> Open alerts
          </button>
        </div>
        <button type="button" className="button subtle designer-review-reset" disabled={!hasOwnLapReview(layout)} onClick={() => apply(resetLapReview)}>
          <RotateCcw size={14} /> Reset to default
        </button>
      </aside>
    </>
  )
}
