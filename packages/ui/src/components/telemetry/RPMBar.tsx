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
 *   0–85% of maxRpm  → teal (normal)
 *   85–92%           → orange/accent (approach redline)
 *   92–100%          → red (redline)
 *
 * Also shows a subtle numeric RPM readout below the bar.
 */
export function RPMBar({ rpm, maxRpm, shiftPoint = 0.92, className, ...props }: RPMBarProps) {
  const safeMax = maxRpm > 0 ? maxRpm : 1
  const fraction = Math.max(0, Math.min(1, rpm / safeMax))
  const pct = fraction * 100

  // Determine colour based on thresholds
  const warnThreshold = 0.85
  const redThreshold  = shiftPoint

  let barColor: string
  if (fraction >= redThreshold) {
    barColor = 'bg-red-500'
  } else if (fraction >= warnThreshold) {
    barColor = 'bg-accent'
  } else {
    barColor = 'bg-teal'
  }

  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      {/* Track */}
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-bg-elevated">
        {/* Warn zone marker */}
        <div
          className="absolute top-0 h-full w-px bg-accent/30"
          style={{ left: `${warnThreshold * 100}%` }}
        />
        {/* Red zone marker */}
        <div
          className="absolute top-0 h-full w-px bg-red-500/40"
          style={{ left: `${redThreshold * 100}%` }}
        />
        {/* Fill */}
        <div
          className={cn('absolute left-0 top-0 h-full rounded-full transition-[width] duration-75', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Numeric */}
      <div className="flex justify-between text-[10px] tabular-nums text-text-muted">
        <span>{Math.round(rpm).toLocaleString()} rpm</span>
        <span>{Math.round(maxRpm).toLocaleString()}</span>
      </div>
    </div>
  )
}
