import * as React from 'react'
import { cn } from '../../lib/utils'

export interface FuelWidgetProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Fuel remaining in litres. */
  fuel: number
  /** Tank capacity in litres. Used to compute fill percentage. */
  capacity: number
  /** Rolling average fuel consumption per lap in litres. 0 = unknown. */
  fuelPerLap: number
}

/**
 * Fuel level bar with litres remaining, per-lap consumption, and laps-to-empty estimate.
 */
export function FuelWidget({ fuel, capacity, fuelPerLap, className, ...props }: FuelWidgetProps) {
  const safeCap = capacity > 0 ? capacity : 110
  const fillPct = Math.max(0, Math.min(100, (fuel / safeCap) * 100))
  const lapsLeft = fuelPerLap > 0 ? fuel / fuelPerLap : null

  const fillColor =
    fillPct < 10 ? 'bg-red-500' :
    fillPct < 25 ? 'bg-accent'  :
    'bg-teal'

  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      {/* Bar */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-bg-elevated">
        <div
          className={cn('absolute left-0 top-0 h-full rounded-full transition-[width] duration-300', fillColor)}
          style={{ width: `${fillPct}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono tabular-nums font-semibold text-text-primary">
          {fuel.toFixed(1)}
          <span className="ml-0.5 text-[10px] font-normal text-text-muted">L</span>
        </span>

        {fuelPerLap > 0 && (
          <span className="text-text-secondary">
            {fuelPerLap.toFixed(2)}
            <span className="ml-0.5 text-text-muted">L/lap</span>
          </span>
        )}

        {lapsLeft !== null && (
          <span className={cn('font-mono tabular-nums', fillPct < 10 ? 'text-red-400' : 'text-text-secondary')}>
            ~{Math.floor(lapsLeft)}
            <span className="ml-0.5 text-text-muted">laps</span>
          </span>
        )}
      </div>
    </div>
  )
}
