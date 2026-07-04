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
 * - Negative (faster): green bar extending left from centre
 * - Positive (slower): red bar extending right from centre
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
      <div className="relative h-2 w-full overflow-hidden rounded-pill bg-[var(--panel-3)]">
        {/* Centre line */}
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-px bg-[var(--border)]" />
        {/* Fill */}
        {clamped !== 0 && (
          <div
            className="absolute top-0 h-full rounded-pill transition-all duration-100"
            style={{
              ...(isFaster
                ? { right: '50%', background: 'var(--green)' }
                : { left:  '50%', background: 'var(--red)' }
              ),
              width: `${pct}%`,
            }}
          />
        )}
      </div>
      {/* Label */}
      <div
        className={cn(
          'text-center font-saira text-xs font-semibold tabular-nums',
          isFaster ? 'text-[var(--green)]' : clamped === 0 ? 'text-[var(--muted)]' : 'text-[var(--red)]',
        )}
      >
        {label}
      </div>
    </div>
  )
}
