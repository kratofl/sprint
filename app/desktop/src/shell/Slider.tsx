import { useLayoutEffect, useRef } from 'react'

/**
 * A whole-number slider (`.slider` in styles.css) with its value as text beside it. `onChange`
 * follows the thumb; `onCommit` fires once the pointer or key lets go, so a drag is one change.
 * `valueText` words a step ("3 s", "Until Ack") for the text beside it and for screen readers; the
 * label comes from the row around it.
 */
export function Slider({
  value,
  min,
  max,
  valueText,
  onChange,
  onCommit,
  disabled = false,
  ...labels
}: {
  value: number
  min: number
  max: number
  valueText: (value: number) => string
  onChange: (value: number) => void
  onCommit: (value: number) => void
  disabled?: boolean
} & ({ 'aria-labelledby': string; 'aria-describedby'?: string } | { 'aria-label': string })) {
  const input = useRef<HTMLInputElement>(null)
  // The brand fill runs up to the thumb; CSS reads how far as a 0–1 custom property.
  useLayoutEffect(() => {
    input.current?.style.setProperty('--slider-fill', String(max > min ? (value - min) / (max - min) : 0))
  }, [value, min, max])

  return (
    <span className="slider-field">
      <input
        ref={input}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-valuetext={valueText(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={(event) => onCommit(Number(event.currentTarget.value))}
        onKeyUp={(event) => onCommit(Number(event.currentTarget.value))}
        {...labels}
      />
      <span className="slider-value tabular" aria-hidden="true">
        {valueText(value)}
      </span>
    </span>
  )
}
