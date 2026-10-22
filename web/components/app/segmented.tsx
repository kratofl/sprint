'use client'

// The segmented control: 2–5 closely related options that change how the current
// view is shown, text only, equal-width 24px segments of at least 72px with 2px
// between them. The selected segment carries segment-selected, shadow-segment and
// semibold; there is no separate sliding thumb. In content it is a flat fill-strong
// track with radius-md and radius-sm segments; in the toolbar a pill on the
// toolbar fill; below lg a pill with 40px segments. Not for navigation.
// Keyboard follows the radio group pattern: one Tab stop, arrow keys move and select.

import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

export function Segmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className,
}: {
  ariaLabel: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  const index = options.findIndex((option) => option.value === value)
  const group = useRef<HTMLDivElement>(null)
  const onKeyDown = (event: KeyboardEvent) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = (Math.max(0, index) + step + options.length) % options.length
    onChange(options[next].value)
    group.current?.querySelectorAll<HTMLButtonElement>('[role=radio]')[next]?.focus()
  }
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'grid w-fit auto-cols-fr grid-flow-col gap-0.5 rounded-md bg-fill-strong p-0.5 in-[.toolbar-band]:rounded-full in-[.toolbar-band]:bg-toolbar-fill max-lg:w-full max-lg:rounded-full max-lg:p-1',
        className,
      )}
    >
      {options.map((option, position) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (index < 0 && position === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-6 min-w-[72px] rounded-sm px-2.5 text-footnote font-medium whitespace-nowrap text-label transition-[background-color,box-shadow] in-[.toolbar-band]:rounded-full motion-reduce:transition-none max-lg:h-10 max-lg:min-w-0 max-lg:rounded-full max-lg:px-3',
              selected && 'bg-segment-selected font-semibold shadow-(--shadow-segment)',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
