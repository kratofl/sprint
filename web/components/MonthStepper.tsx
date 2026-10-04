'use client'

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { formatMonth, shiftMonth, type Month } from '@/lib/period'

type MonthStepperProps = {
  value: Month
  onChange: (month: Month) => void
}

// Toolbar stepper ‹ September 2026 › for moving the view one month at a time.
export default function MonthStepper({ value, onChange }: MonthStepperProps) {
  return (
    <div role="group" aria-label="Month" className="toolbar-group">
      <button
        type="button"
        className="toolbar-icon"
        aria-label="Previous month"
        title="Previous month"
        onClick={() => onChange(shiftMonth(value, -1))}
      >
        <IconChevronLeft size={12} stroke={2.4} aria-hidden />
      </button>
      <span className="stepper-label" aria-live="polite">{formatMonth(value)}</span>
      <button
        type="button"
        className="toolbar-icon"
        aria-label="Next month"
        title="Next month"
        onClick={() => onChange(shiftMonth(value, 1))}
      >
        <IconChevronRight size={12} stroke={2.4} aria-hidden />
      </button>
    </div>
  )
}
