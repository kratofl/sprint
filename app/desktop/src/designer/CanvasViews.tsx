import type { CSSProperties } from 'react'
import { GEAR_SPOT, drawnWidgets, layoutRect, pageTree, type DashLayout, type DashPage, type GridSpan } from '@sprint/dashboard'
import { widgetName } from '../views/DashesDomain'
import { flattenTree, nodeRect } from './groupOps'
import { emptyCells } from './layoutOps'
import { widgetIcon } from './widgetIcons'

/**
 * How the Layout section shows the dash it edits on: its outline (the default), the real dash faded
 * back with each widget named (labels), or the real dash with a name tag on each widget (preview).
 * The toolbar switches it (`ViewTools`).
 */
export type CanvasView = 'outline' | 'labels' | 'preview'

export const CANVAS_VIEWS: ReadonlyArray<{ value: CanvasView; label: string }> = [
  { value: 'outline', label: 'Outline' },
  { value: 'labels', label: 'Labels' },
  { value: 'preview', label: 'Preview' },
]

type LayerProps = { layout: DashLayout; page: DashPage; width: number; height: number }

const boxOf = (layout: DashLayout, width: number, height: number) => (span: GridSpan): CSSProperties => {
  const rect = layoutRect(layout, width, height, span)
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/** A side bar spot: too narrow for a name across it. */
const isUpright = (layout: DashLayout, width: number, height: number, span: GridSpan): boolean => layoutRect(layout, width, height, span).width < 50

/** Free cells as a dot at their centre, in every view, so free space shows. */
function FreeCells({ layout, page, width, height }: LayerProps) {
  const box = boxOf(layout, width, height)
  return (
    <>
      {emptyCells(layout, page).map((cell) => (
        <span key={`${cell.col}:${cell.row}`} className="designer-free-cell" style={box(cell)} />
      ))}
    </>
  )
}

/**
 * The outline, in place of the dash: every widget a hairline region with its icon, name and size
 * in cells, the gear's spot hatched (it is always there), groups dashed round their widgets, free
 * cells dotted. The app's own look, so nobody takes it for the dash's design.
 */
export function DashOutline({ layout, page, width, height }: LayerProps) {
  const box = boxOf(layout, width, height)
  const groups = flattenTree(pageTree(page)).flatMap((node) => {
    if (node.kind !== 'group' || node.group.mode !== 'together') return []
    const rect = nodeRect(node)
    return rect ? [{ id: node.id, name: node.group.name, rect }] : []
  })
  return (
    <div className="designer-canvas-layer designer-outline" style={{ width, height }} aria-hidden="true">
      <FreeCells layout={layout} page={page} width={width} height={height} />
      {layout.zoned && (
        <span className="designer-region is-gear" style={box(GEAR_SPOT)}>
          <span className="designer-region-name">Gear</span>
          <span className="designer-region-size">fixed</span>
        </span>
      )}
      {drawnWidgets(page).map((widget) => {
        const Icon = widgetIcon(widget.type)
        const upright = isUpright(layout, width, height, widget)
        // A region one short row high (the top bar spot) has no room for its size.
        const low = layoutRect(layout, width, height, widget).height < 44
        return (
          <span key={widget.id} className={upright ? 'designer-region is-upright' : 'designer-region'} style={box(widget)}>
            <span className="designer-region-head">
              <Icon size={13} aria-hidden="true" />
              <span className="designer-region-name">{widgetName(widget)}</span>
            </span>
            {!upright && !low && <span className="designer-region-size">{`${widget.colSpan} × ${widget.rowSpan}`}</span>}
          </span>
        )
      })}
      {groups.map((group) => (
        <span key={group.id} className="designer-region-group" style={box(group.rect)}>
          <span className="designer-region-group-name">{group.name}</span>
        </span>
      ))}
    </div>
  )
}

/**
 * Over the real dash: in the labels view (the dash faded back by the canvas) a glass chip with its
 * icon and name in the middle of each widget, in the preview a dashed hairline round each and a
 * name tag in its corner. Free cells are dotted in both.
 */
export function DashLabels({ view, layout, page, width, height }: LayerProps & { view: 'labels' | 'preview' }) {
  const box = boxOf(layout, width, height)
  return (
    <div className={`designer-canvas-layer designer-labels is-${view}`} style={{ width, height }} aria-hidden="true">
      <FreeCells layout={layout} page={page} width={width} height={height} />
      {view === 'labels' && layout.zoned && (
        <span className="designer-label-cell" style={box(GEAR_SPOT)}>
          <span className="designer-chip is-quiet">Gear</span>
        </span>
      )}
      {drawnWidgets(page).map((widget) => {
        const Icon = widgetIcon(widget.type)
        const upright = isUpright(layout, width, height, widget)
        return (
          <span key={widget.id} className="designer-label-cell" style={box(widget)}>
            {view === 'labels' ? (
              <span className={upright ? 'designer-chip is-upright' : 'designer-chip'}>
                <Icon size={13} aria-hidden="true" />
                {!upright && <span className="designer-chip-name">{widgetName(widget)}</span>}
              </span>
            ) : (
              !upright && <span className="designer-tag">{widgetName(widget)}</span>
            )}
          </span>
        )
      })}
    </div>
  )
}
