import * as React from 'react'
import { cn } from '../../lib/utils'

export interface LapTimeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Lap time in seconds. Pass undefined or 0 to show the empty state. */
  seconds: number | undefined
  /** Show milliseconds. Defaults to true. */
  showMs?: boolean
}

/**
 * Formats a lap time from seconds into `m:ss.SSS` (or `m:ss` without ms).
 * Always uses monospaced, tabular numerals so digits don't shift width.
 */
export function LapTime({ seconds, showMs = true, className, ...props }: LapTimeProps) {
  const formatted = React.useMemo(() => formatLapTime(seconds, showMs), [seconds, showMs])

  return (
    <span
      className={cn('font-mono tabular-nums', className)}
      {...props}
    >
      {formatted}
    </span>
  )
}

export function formatLapTime(seconds: number | undefined, showMs = true): string {
  if (!seconds || seconds <= 0) return showMs ? '–:––.–––' : '–:––'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (showMs) {
    return `${m}:${s.toFixed(3).padStart(6, '0')}`
  }
  return `${m}:${Math.floor(s).toString().padStart(2, '0')}`
}
