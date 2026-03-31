import * as React from 'react'
import { cn } from '../../lib/utils'

export interface GearDisplayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current gear. -1 = reverse, 0 = neutral, 1–8 = forward. */
  gear: number
  /** Speed in km/h. */
  speedKph: number
}

function gearLabel(gear: number): string {
  if (gear === -1) return 'R'
  if (gear === 0)  return 'N'
  return gear.toString()
}

/**
 * Large gear + speed display.
 * Gear is shown in accent orange; speed in primary text.
 */
export function GearDisplay({ gear, speedKph, className, ...props }: GearDisplayProps) {
  const label = gearLabel(gear)
  const speed = Math.round(speedKph)

  return (
    <div className={cn('flex flex-col items-center', className)} {...props}>
      <span
        className={cn(
          'font-display font-bold leading-none tabular-nums text-accent',
          'text-[5rem]',
        )}
      >
        {label}
      </span>
      <span className="mt-1 font-mono text-2xl font-semibold tabular-nums text-text-primary">
        {speed}
        <span className="ml-1 text-sm font-normal text-text-muted">km/h</span>
      </span>
    </div>
  )
}
