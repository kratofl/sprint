import { DEFAULT_DASH_CHROME, isDashWidgetLabel } from '@sprint/dashboard'
import type { DashLayout, DashWidget, DashWidgetLabel } from '@sprint/dashboard'
import { Segmented } from './controls'

/** The label spots a widget can pick, in the bar's order. Center is centred above the value, Top cut into the top edge. */
const LABEL_SPOTS: ReadonlyArray<{ value: DashWidgetLabel; label: string }> = [
  { value: 'top', label: 'Center' },
  { value: 'on', label: 'Top' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'off', label: 'Off' },
]

/**
 * Over the selected widget on the canvas: where its label sits. The checked spot is the widget's
 * own or the dash's (Theme > Frames); picking the dash's spot drops the widget's own, so it
 * follows the dash again (`onPick(undefined)`).
 */
export function LabelBar({ layout, widget, left, top, onPick }: { layout: DashLayout; widget: DashWidget; left: number; top: number; onPick: (label: DashWidgetLabel | undefined) => void }) {
  const dashLabel = (layout.chrome ?? DEFAULT_DASH_CHROME).label
  return (
    <div className="designer-glass designer-selection-bar designer-label-bar" style={{ left, top }}>
      <span className="muted">Label</span>
      <span className="designer-dock-sep" aria-hidden="true" />
      <Segmented
        label="Label"
        value={widget.style?.label ?? dashLabel}
        options={LABEL_SPOTS}
        onChange={(label) => {
          if (isDashWidgetLabel(label)) onPick(label === dashLabel ? undefined : label)
        }}
      />
    </div>
  )
}
