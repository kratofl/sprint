import * as React from 'react'
import { cn } from '../../lib/utils'

export interface RPMBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current engine RPM. */
  rpm: number
  /** Rev limit / maximum RPM. */
  maxRpm: number
  /**
   * Shift-light point as a fraction of maxRpm (0–1).
   * Above this threshold the bar turns orange, then red at 97%.
   * Defaults to 0.92.
   */
  shiftPoint?: number
}

/**
 * Horizontal RPM bar with three colour zones:
 *   0–85% of maxRpm  → green (normal)
 *   85–92%           → orange/accent (approach redline)
 *   92–100%          → red (redline)
 *
 * Also shows a subtle numeric RPM readout below the bar.
 */
export function RPMBar({ rpm, maxRpm, shiftPoint = 0.92, className, ...props }: RPMBarProps) {
  const safeMax = maxRpm > 0 ? maxRpm : 1
  const fraction = Math.max(0, Math.min(1, rpm / safeMax))
  const pct = fraction * 100

  const warnThreshold = 0.85
  const redThreshold  = shiftPoint
  const fillColor =
    fraction >= redThreshold ? 'var(--red)' :
    fraction >= warnThreshold ? 'var(--orange)' :
    'var(--green)'

  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      {/* Track */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-pill bg-[var(--panel-3)]">
        {/* Warn zone marker */}
        <div
          className="absolute top-0 h-full w-px bg-[var(--orange)]/25"
          style={{ left: `${warnThreshold * 100}%` }}
        />
        {/* Redline marker */}
        <div
          className="absolute top-0 h-full w-px bg-[var(--red)]/30"
          style={{ left: `${redThreshold * 100}%` }}
        />
        <div
          className="absolute left-0 top-0 h-full rounded-pill transition-[width] duration-75"
          style={{
            width: `${pct}%`,
            background: fillColor,
          }}
        />
      </div>
      {/* Numeric */}
      <div className="flex justify-between font-saira text-[10px] tabular-nums text-[var(--muted)]">
        <span>{Math.round(rpm).toLocaleString('en-US')} rpm</span>
        <span>{Math.round(maxRpm).toLocaleString('en-US')}</span>
      </div>
    </div>
  )
}
