import { useEffect, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { DashBorder, DashLabelMode } from '@sprint/dashboard'
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

/** One choice of a few, as a segmented control; picking the current one does nothing. `full` spreads it across its panel. */
export function Segmented<T extends string>({ label, value, options, full = false, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; full?: boolean; onChange: (value: T) => void }) {
  return (
    <div className={full ? 'segmented designer-segmented-full' : 'segmented'} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" className="segmented-item" aria-checked={option.value === value} onClick={() => option.value !== value && onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** The flat style's edges and labels, as the frame controls offer them. */
export const BORDER_OPTIONS: ReadonlyArray<{ value: DashBorder; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'thin', label: 'Thin' },
  { value: 'normal', label: 'Normal' },
  { value: 'thick', label: 'Thick' },
]
export const LABEL_OPTIONS: ReadonlyArray<{ value: DashLabelMode; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'Small' },
  { value: 'capsule', label: 'Capsule' },
]

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
