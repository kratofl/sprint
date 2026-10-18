'use client'

// The toolbar's period control: ‹ October 2026 ›. Steps one period back or forward;
// pure presentation, the page decides what a period is and which steps exist.
// Put it into the toolbar through PageHeader's `scope`. Desktop: a 28px bordered
// radius-sm control with 26px chevron buttons; phones: a 44px pill across the
// width of the toolbar's second row. The label is announced when it changes.

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

const chevronClass =
  'grid h-full w-[26px] shrink-0 place-items-center text-label-secondary transition-colors hover:bg-fill hover:text-label disabled:text-label-disabled disabled:hover:bg-transparent max-lg:w-11 [&_svg]:size-4 [&_svg]:[stroke-width:2] max-lg:[&_svg]:size-5'

export function PeriodStepper({
  label,
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
  previousLabel,
  nextLabel,
}: {
  label: string
  onPrevious: () => void
  onNext: () => void
  previousDisabled?: boolean
  nextDisabled?: boolean
  /** Accessible names of the chevrons, e.g. "Previous month". */
  previousLabel: string
  nextLabel: string
}) {
  return (
    <div className="flex h-7 items-stretch rounded-sm border border-border-control bg-surface max-lg:h-11 max-lg:w-full max-lg:rounded-full">
      <button
        type="button"
        onClick={onPrevious}
        disabled={previousDisabled}
        aria-label={previousLabel}
        title={previousLabel}
        className={cn(chevronClass, 'rounded-l-sm border-r border-separator max-lg:rounded-l-full')}
      >
        <IconChevronLeft />
      </button>
      <span aria-live="polite" className="flex min-w-[7.5rem] flex-1 items-center justify-center px-2.5 text-callout font-semibold whitespace-nowrap tabular-nums">
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        aria-label={nextLabel}
        title={nextLabel}
        className={cn(chevronClass, 'rounded-r-sm border-l border-separator max-lg:rounded-r-full')}
      >
        <IconChevronRight />
      </button>
    </div>
  )
}
