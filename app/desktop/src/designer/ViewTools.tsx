import { Eye, Grid2x2 } from 'lucide-react'
import { dashPreviewStates, type DashPreviewState } from '@sprint/dashboard'
import { CANVAS_VIEWS, type CanvasView } from './CanvasViews'
import { Segmented } from './controls'

/**
 * The title bar's view group in the Layout section: "View" and how the canvas shows the dash
 * (`CanvasView`); once that is the real dash, what it shows (live or a sample moment) and the grid.
 */
export function ViewTools({
  view,
  onView,
  previewState,
  onPreviewState,
  showGrid,
  onToggleGrid,
}: {
  view: CanvasView
  onView: (view: CanvasView) => void
  previewState: DashPreviewState
  onPreviewState: (state: DashPreviewState) => void
  showGrid: boolean
  onToggleGrid: () => void
}) {
  return (
    <div className="designer-view-tools" role="group" aria-label="View">
      <span className="designer-view-caption" aria-hidden="true">
        View
      </span>
      <Segmented label="View" value={view} options={CANVAS_VIEWS} onChange={onView} />
      {view !== 'outline' && (
        <>
          <label className="designer-preview" title="What the dash shows while you design">
            <Eye size={14} aria-hidden="true" />
            <select
              aria-label="Dash shows"
              value={previewState}
              onChange={(event) => {
                const match = dashPreviewStates.find((option) => option.state === event.target.value)
                if (match) onPreviewState(match.state)
              }}
            >
              {dashPreviewStates.map((option) => (
                <option key={option.state} value={option.state}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="icon-button designer-toggle" aria-label="Grid" title="Show the grid" aria-pressed={showGrid} onClick={onToggleGrid}>
            <Grid2x2 size={16} />
          </button>
        </>
      )}
    </div>
  )
}
