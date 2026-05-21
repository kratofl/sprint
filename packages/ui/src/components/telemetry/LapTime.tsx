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
  const totalMs = Math.round(seconds * 1000)
  if (totalMs <= 0) return showMs ? '–:––.–––' : '–:––'
  const totalSeconds = Math.floor(totalMs / 1000)
  const m = Math.floor(totalSeconds / 60)
  if (showMs) {
    const rem = totalMs % 60000
    const s = Math.floor(rem / 1000)
    const ms = rem % 1000
    return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
