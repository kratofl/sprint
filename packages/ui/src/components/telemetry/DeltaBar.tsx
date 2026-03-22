import * as React from 'react'
import { cn } from '../../lib/utils'

export interface DeltaBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Delta in seconds. Positive = slower than target, negative = faster.
   * Typical range is -2.0 to +2.0 for display purposes.
   */
  delta: number
  /** Max delta value that fills the bar completely. Defaults to 2.0 s. */
  maxDelta?: number
}

/**
 * Shows a +/- delta bar relative to the target lap time.
 * - Negative (faster): teal bar extending left from centre
 * - Positive (slower): orange/accent bar extending right from centre
 */
export function DeltaBar({ delta, maxDelta = 2.0, className, ...props }: DeltaBarProps) {
  const clamped = Math.max(-maxDelta, Math.min(maxDelta, delta))
  const pct = Math.abs(clamped / maxDelta) * 50 // 0–50% from centre

  const isFaster = clamped < 0
  const sign = isFaster ? '−' : clamped === 0 ? '' : '+'
  const label = clamped === 0 ? '0.000' : `${sign}${Math.abs(clamped).toFixed(3)}`

  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      {/* Bar track */}
      <div className="relative h-2 w-full rounded-full bg-bg-surface overflow-hidden">
        {/* Centre line */}
        <div className="absolute left-1/2 top-0 h-full w-px bg-border-glass -translate-x-px" />
        {/* Fill */}
        {clamped !== 0 && (
          <div
            className={cn(
              'absolute top-0 h-full transition-all duration-100',
              isFaster
                ? 'right-1/2 bg-teal'
                : 'left-1/2 bg-accent',
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {/* Label */}
      <div
        className={cn(
          'text-center text-xs font-mono tabular-nums font-semibold',
          isFaster ? 'text-teal' : clamped === 0 ? 'text-text-muted' : 'text-accent',
        )}
      >
        {label}
      </div>
    </div>
  )
}
