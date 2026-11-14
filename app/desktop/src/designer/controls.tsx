import { useEffect, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import { MAX_ALERT_SECONDS, MIN_ALERT_SECONDS } from '@sprint/dashboard'
import type { GridRect } from '../views/DashesDomain'

/** Small form controls the designer's panels share. */

/** Commits a rename-on-blur text box with Enter. */
export function blurOnEnter(event: ReactKeyboardEvent<HTMLInputElement>): void {
  if (event.key === 'Enter') event.currentTarget.blur()
}

/** A number with inline spin buttons; the value itself is read-only. */
export function NumberBox({
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
    <div className="designer-numberbox" role="group" aria-label={label}>
      <button type="button" className="designer-spin" aria-label={`Decrease ${label}`} disabled={!canDecrease} onClick={onDecrease}>
        <Minus size={12} />
      </button>
      <span className="designer-numberbox-value tabular">{display}</span>
      <button type="button" className="designer-spin" aria-label={`Increase ${label}`} disabled={!canIncrease} onClick={onIncrease}>
        <Plus size={12} />
      </button>
    </div>
  )
}

/**
 * Column, row, width and height of a grid rectangle, one-based on screen. `onChange` gets the
 * field that changed, so a run of clicks on one field can be one undo step.
 */
export function GeometryFields({ rect, onChange }: { rect: GridRect; onChange: (rect: GridRect, field: keyof GridRect) => void }) {
  return (
    <div className="designer-geometry">
      <GeometryStepper label="Column" value={rect.col} offset={1} onChange={(col) => onChange({ ...rect, col }, 'col')} />
      <GeometryStepper label="Row" value={rect.row} offset={1} onChange={(row) => onChange({ ...rect, row }, 'row')} />
      <GeometryStepper label="Width" value={rect.colSpan} min={1} onChange={(colSpan) => onChange({ ...rect, colSpan }, 'colSpan')} />
      <GeometryStepper label="Height" value={rect.rowSpan} min={1} onChange={(rowSpan) => onChange({ ...rect, rowSpan }, 'rowSpan')} />
    </div>
  )
}

function GeometryStepper({ label, value, min = 0, offset = 0, onChange }: { label: string; value: number; min?: number; offset?: number; onChange: (value: number) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <NumberBox label={label} display={String(value + offset)} canDecrease={value > min} canIncrease onDecrease={() => onChange(Math.max(min, value - 1))} onIncrease={() => onChange(value + 1)} />
    </div>
  )
}

/**
 * An alert's duration, 0.5 s up to `max` (5 s, or 15 s for the lap summary: `maxAlertSeconds`) in
 * `step` seconds (`setAlertOverride`'s clamp/round). Steps in tenths so +/- never drifts on
 * floating-point seconds.
 */
export function DurationBox({ seconds, max = MAX_ALERT_SECONDS, step = 0.1, onChange }: { seconds: number; max?: number; step?: number; onChange: (seconds: number) => void }) {
  const tenths = Math.round(seconds * 10)
  const [minTenths, maxTenths, stepTenths] = [Math.round(MIN_ALERT_SECONDS * 10), Math.round(max * 10), Math.round(step * 10)]
  return (
    <NumberBox
      label="Duration"
      display={`${(tenths / 10).toFixed(1)} s`}
      canDecrease={tenths > minTenths}
      canIncrease={tenths < maxTenths}
      onDecrease={() => onChange(Math.max(minTenths, tenths - stepTenths) / 10)}
      onIncrease={() => onChange(Math.min(maxTenths, tenths + stepTenths) / 10)}
    />
  )
}

/** A free-text value committed on blur or Enter. */
export function TextConfigField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <label className="field">
      <span>{label}</span>
      <input value={text} onChange={(event) => setText(event.target.value)} onKeyDown={blurOnEnter} onBlur={() => onCommit(text)} />
    </label>
  )
}
